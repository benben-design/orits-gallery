import { NextResponse } from 'next/server';
import {
  verifyReturn,
  readSignedReturn,
  cancelTransaction,
  checkReturnQuery,
} from '@/lib/payments/hyp';
import { takeReturnSlot } from '@/lib/payments/return-throttle';
import { readClientIp } from '@/lib/auth/client-ip';
import {
  getOrderById,
  settlePaidOrder,
  recordUnfulfillableOrder,
} from '@/lib/data/orders-repository';
import { CART_COOKIE_NAME } from '@/lib/cart/cart-contents';
import { CART_COOKIE_PATH } from '@/lib/cart/cart-cookie';
import { absoluteUrl } from '@/lib/site-url';
import { revalidatePublicSite } from '@/lib/revalidate';
import { localeHref, defaultLocale, isLocale } from '@/lib/i18n/config';

/**
 * What happens when a buyer's browser comes back from the payment page.
 *
 * **This is the only way this application ever learns that money moved.** Hyp
 * Pay at our tier has no webhook and no transaction-status query, so there is no
 * second opinion and no later reconciliation to fall back on — see api.md, which
 * records the amended rule and the branch that cannot be closed.
 *
 * **Both return URLs run this same function**, and that is deliberate. Which URL
 * Hyp sends the browser to is a hint; the signed redirect is the fact.
 *
 * The order of operations is the whole of the design:
 *
 *   1. **The gate, then VERIFY. Nothing that matters happens before them.** A
 *      return that repeats a key, carries one of ours, or names no order in
 *      the shape of one of our ids is refused before the database is read or
 *      Hyp is asked anything. A source over the rate limit is refused next.
 *      Only then is the order read — for its language — and VERIFY asked
 *      whether Hyp's signature over the rest is genuine.
 *   2. **Anything short of a verified signature changes nothing anywhere**, and
 *      the buyer is told the payment is not confirmed.
 *   3. **Only now is the redirect read**, because only now is it Hyp's statement
 *      rather than a URL somebody typed. Its `CCode` says whether a charge
 *      happened; its `Order` and `Amount` say whether it was the charge we asked
 *      for; its `Id` names it.
 *   4. **Not a charge: nothing changes.** A charge for exactly this order at
 *      exactly its total: the paintings are seized and the order is paid, then
 *      the cart is cleared. **A charge for anything else** — another amount, an
 *      order we cannot find — is money for something we did not sell, and it is
 *      voided, or recorded as a refund owed. The paintings are never touched.
 *
 * **Missing credentials can never read as success.** `verifyReturn` answers
 * `cannotVerify`, which lands in the same branch as a forged return.
 *
 * **Every response carries `Cache-Control: no-store`**, whatever the outcome —
 * including a failure nobody anticipated. Nothing on the money path is left to
 * a default.
 */

/**
 * The buyer always ends up on their own order page when we can identify one.
 *
 * The page reads the order's row and says what is true of it — confirmed, not
 * confirmed, or sold-out-from-under-you. That is what makes a refresh safe:
 * there is no outcome carried in the URL to be re-applied, and no flash message
 * to be lost.
 */
function orderDestination(locale, orderId) {
  return absoluteUrl(localeHref(locale, `/order/${orderId}`));
}

/**
 * **The phrase to search the function logs for.** Every refund that is owed and
 * recorded on no order — so that the log line is the whole of the record — is
 * logged under exactly this, and deployment.md's launch checklist names it.
 * Change it there too, or the search finds nothing and says so reassuringly.
 */
const UNRECORDED_REFUND = '[payments] REFUND OWED — NOT RECORDED ON ANY ORDER';

/**
 * Said beside a failed void when Hyp answered 920. That code is documented as
 * "cannot be cancelled — already transmitted, or does not exist", and it is
 * also what a void of an already-voided transaction most likely answers: a
 * refresh of the same return sends the void again. So the line stays plain
 * about the refund, and says where to look before making one.
 */
const ALREADY_VOIDED_NOTE =
  'CCode 920 is also what Hyp answers for a transaction that was already voided, which is what a refresh of the same return produces. Check this Id in the Hyp console before refunding.';

/**
 * The shape of every order id this site issues: `gen_random_uuid()`, as text.
 *
 * A return whose `Order` is anything else cannot belong to one of our orders,
 * so it is refused before the database is read or Hyp is asked — it would
 * otherwise cost both, for anybody, as often as they liked. What that gives up
 * is recorded in api.md: a *genuine* charge whose `Order` a buyer edited into
 * something else is no longer voided automatically. That is possible only while
 * payment-page signing is off, which the launch checklist turns on, and the log
 * line below is loud for exactly that case.
 */
const ORDER_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Said for every return refused before VERIFY answered. Not "refund owed" —
 * nothing here was verified, so nothing here is evidence that money moved —
 * but it might have, which is why it is shouted and why deployment.md tells her
 * to search for it beside the refund phrase.
 */
const REFUSED_UNVERIFIED = '[payments] RETURN REFUSED BEFORE VERIFICATION — CHECK THE HYP CONSOLE IF A PAYMENT IS MISSING';

/** Every response on this path, and only through here. */
function redirectTo(url) {
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * @param {Request & {nextUrl: URL}} request
 * @returns {Promise<NextResponse>}
 */
export async function handlePaymentReturn(request) {
  let destination = absoluteUrl(localeHref(defaultLocale, '/checkout'));

  try {
    return await handle(request, (url) => {
      destination = url;
    });
  } catch (error) {
    /*
      Nothing anticipated this — the database went away, most likely. Whatever
      was committed stays committed and the order page reads the truth from the
      row; what must not happen is a bare 500 from the money path with whatever
      caching a platform chooses to give it.
    */
    console.error('[payments] RETURN FAILED UNEXPECTEDLY', error);
    return redirectTo(destination);
  }
}

async function handle(request, setDestination) {
  /*
    The query, in its original order, as it is passed to VERIFY. Hyp signs over
    the parameters as they were sent, so nothing here sorts, drops or rebuilds
    them from named fields.

    **It is not byte-for-byte what Hyp sent, and cannot be.** Measured on
    28-09-2026: Next rebuilds a request's URL from its parsed query before any
    handler runs — `request.url` and `request.nextUrl` alike — with form
    encoding. Hyp's own documented `Fild1=Jenny%20Parkington` reaches here as
    `Jenny+Parkington`, `~!()` percent-encoded, a raw `;` as `%3B`. Keys, order
    and decoded values survive; the encoding does not. So VERIFY succeeds only
    if Hyp checks its signature over decoded values, which is the ordinary way
    for a server to do it and is unproven until a real terminal answers — see
    deployment.md. If it does not, every payment fails verification and the
    order stays pending: the safe way to be wrong, and the first real
    transaction shows it.
  */
  const rawQuery = request.nextUrl.search.replace(/^\?/, '');

  /* ---- 0. What can be refused without asking anybody. ---- */

  /*
    The gate is pure, so it runs before anything is read. `verifyReturn` runs
    it again, which costs nothing and keeps that function safe on its own.
  */
  const gate = checkReturnQuery(rawQuery);
  const claimedOrder = request.nextUrl.searchParams.get('Order');
  const orderShaped = Boolean(claimedOrder) && ORDER_ID_SHAPE.test(claimedOrder);

  if (!gate.ok) {
    /*
      Refused unasked — but deployment.md records that a real Hyp return might
      trip the gate, so a buyer whose redirect names one of our orders is sent
      to it, where the page says the payment is not confirmed.
    */
    console.error(REFUSED_UNVERIFIED, {
      reason: 'refusedQuery:' + gate.error,
      key: gate.key,
      claimedOrder: orderShaped ? claimedOrder : null,
    });
    return redirectTo(
      orderShaped
        ? orderDestination(defaultLocale, claimedOrder)
        : absoluteUrl(localeHref(defaultLocale, '/checkout'))
    );
  }

  if (!orderShaped) {
    console.error(REFUSED_UNVERIFIED, {
      reason: 'orderNotOurs',
      claimedOrder: claimedOrder ? claimedOrder.slice(0, 64) : null,
      claimedTransactionId: request.nextUrl.searchParams.get('Id'),
    });
    return redirectTo(absoluteUrl(localeHref(defaultLocale, '/checkout')));
  }

  /*
    From here the buyer can always be sent to the order the redirect names. The
    order page reads the row and says what is true, so pointing at it before
    anything is verified promises nothing.
  */
  setDestination(orderDestination(defaultLocale, claimedOrder));

  /* ---- The rate limit, before the order is read or Hyp is asked. ---- */

  const slot = await takeReturnSlot(await readClientIp());

  if (!slot.ok) {
    /*
      Thirty returns in an hour from one source is not a buyer — but if it ever
      is, money may have moved, so this is as loud as any refusal before
      verification. The order stays as it was; a refresh after the window
      verifies normally.
    */
    console.error(REFUSED_UNVERIFIED, {
      reason: 'rateLimited',
      claimedOrder,
      claimedTransactionId: request.nextUrl.searchParams.get('Id'),
    });
    return redirectTo(orderDestination(defaultLocale, claimedOrder));
  }

  if (slot.unattributed) {
    console.error('[payments] return from an unattributable source — the rate limit did not apply', {
      claimedOrder,
    });
  }

  /*
    Read before verification, and used for exactly one thing until verification
    has answered: which language to reply in. `buyer_locale` was captured at
    checkout precisely because it cannot be recovered afterwards. Nothing about
    this order is believed or changed on the strength of an unverified redirect.
  */
  const order = await getOrderById(claimedOrder);
  const locale = order && isLocale(order.buyerLocale) ? order.buyerLocale : defaultLocale;

  const fallback = absoluteUrl(localeHref(locale, '/checkout'));
  const home = order ? orderDestination(locale, order.id) : fallback;
  setDestination(home);

  /* ---- 1. VERIFY. Nothing is believed before it answers. ---- */

  const verified = await verifyReturn(rawQuery);

  if (!verified.ok) {
    /*
      A refused query, a signature Hyp does not recognise, a system error, or no
      credentials to ask with. One branch on purpose: none of them is evidence
      that money moved, so none of them may move anything here.
    */
    console.error(REFUSED_UNVERIFIED, {
      reason: verified.error,
      key: verified.key,
      ccode: verified.ccode,
      order: claimedOrder,
    });

    return redirectTo(home);
  }

  /* ---- 2. Verified. The redirect is Hyp's statement now, and may be read. ---- */

  const signed = readSignedReturn(rawQuery);

  if (signed.ccode !== '0') {
    /*
      A genuine redirect reporting a payment that did not go through — a decline
      signed by Hyp. Authentic, and not a charge, so exactly as a failed
      verification: nothing changes and the cart stays as it was.
    */
    console.error('[payments] verified return is not a successful payment', {
      ccode: signed.ccode,
      order: signed.order,
      transactionId: signed.transactionId,
    });

    return redirectTo(home);
  }

  /* ---- 3. A charge happened. Was it the charge we asked for? ---- */

  const matches =
    order !== null &&
    signed.order === order.id &&
    signed.amountAgorot !== null &&
    signed.amountAgorot === order.totalAgorot;

  if (!matches) return refuseUnsoldCharge({ order, signed, home });

  /* ---- 4. It was. Settle it. ---- */

  if (!signed.transactionId) {
    /*
      Hyp signed a successful charge for this order at its total, and named no
      transaction. The buyer really paid the right amount for the right order, so
      it is settled — leaving it pending would keep the painting on sale to a
      second buyer and tell the payer their payment failed. What is lost is the
      reference, and with it the unique index's protection and any automatic
      void; the admin order page says so, and she matches it by hand against
      the Hyp console. A refresh is still caught, by the order's status.
    */
    console.error('[payments] VERIFIED PAYMENT WITH NO TRANSACTION ID — SETTLING WITHOUT A REFERENCE', {
      order: order.id,
      amountAgorot: signed.amountAgorot,
    });
  }

  const paymentReference = signed.transactionId;
  const settled = await settlePaidOrder({ orderId: order.id, paymentReference });

  /*
    **A second charge for an order that is already settled.** Hyp signed it, it
    matches, and it names a transaction other than the one the order records —
    a buyer who paid twice, or who paid for an order the artist had since
    cancelled. The first payment bought the painting, so the order is left
    exactly as it is: no `refund_due_at`, which would tell a buyer who owns the
    painting that it is unavailable. The money goes back by a void, and if the
    void fails the log is the whole record.

    An `Id` equal to the stored reference is a refresh and falls through to do
    what it always did. No `Id` at all cannot be told from a refresh, and is
    left alone the same way.
  */
  if (
    (settled.outcome === 'alreadyPaid' || settled.outcome === 'notPending') &&
    paymentReference &&
    paymentReference !== settled.order?.paymentReference
  ) {
    await voidDuplicateCharge({ order: settled.order, transactionId: paymentReference });
  }

  if (settled.outcome === 'paid' || settled.outcome === 'alreadyPaid') {
    if (settled.outcome === 'paid') {
      /*
        **The paintings just became sold, so the pages that offer them have to
        stop.** This is the only writer of `status = 'sold'` that is not an
        admin action; the homepage and gallery are cached, so without this the
        site goes on offering a painting for up to an hour after it sold.

        **On `paid` only.** `alreadyPaid` is a refreshed return: it wrote
        nothing, and clearing anyway would let a buyer reloading their
        confirmation page drop the cache for everyone.
      */
      revalidatePublicSite();
    }

    const response = redirectTo(orderDestination(locale, order.id));

    /*
      **The cart is cleared here and nowhere else on this path.** Only a verified
      charge that actually became a paid order empties it. Deleted on the
      response rather than through `cookies()`, so it travels with the redirect
      itself. `alreadyPaid` clears again, which is a no-op on a refresh and the
      right answer if the first response never reached the browser.
    */
    response.cookies.delete({ name: CART_COOKIE_NAME, path: CART_COOKIE_PATH });

    return response;
  }

  if (settled.outcome === 'lost') {
    /*
      The buyer paid, and somebody else got the painting in the seconds in
      between. Every painting is a one-off, so there is nothing to send and the
      money goes back.
    */
    console.error('[payments] order lost the race after payment', {
      order: order.id,
      paymentReference,
      lostWorkIds: settled.lostWorkIds,
    });

    await voidAndRecord({ order, transactionId: paymentReference });

    /* The cart is deliberately untouched: nothing was sold to this buyer. */
    return redirectTo(orderDestination(locale, order.id));
  }

  /*
    `notPending`, `notFound` or `referenceInUse`. None of them is something the
    buyer can act on, and none of them may be presented as a purchase. The order
    page says what its row actually says.
  */
  console.error('[payments] verified return could not be settled', {
    order: order.id,
    outcome: settled.outcome,
    paymentReference,
  });

  return redirectTo(orderDestination(locale, order.id));
}

/**
 * A verified charge that is not the one we asked for.
 *
 * Hyp signed it, so the money moved — but for an amount that is not this order's
 * total, or against an order we cannot find. The first is what a buyer who edits
 * `Amount` on an unsigned payment page produces; the second should never happen
 * at all. Either way nothing was sold for it, so **the paintings are never
 * seized** and the charge takes the same path as a lost race: voided the same
 * day if Hyp will, and recorded as a refund owed if it will not.
 */
async function refuseUnsoldCharge({ order, signed, home }) {
  console.error('[payments] VERIFIED CHARGE DOES NOT MATCH ITS ORDER — VOIDING', {
    orderFound: order !== null,
    orderId: order?.id ?? null,
    redirectOrder: signed.order,
    expectedAgorot: order?.totalAgorot ?? null,
    chargedAmount: signed.amountRaw,
    chargedAgorot: signed.amountAgorot,
    transactionId: signed.transactionId,
  });

  /*
    A refresh of a return already handled here. The first pass recorded this
    transaction's id against the order, so there is nothing left to do — and
    voiding again would only produce a failure worth nobody's attention.
  */
  if (order && signed.transactionId && order.paymentReference === signed.transactionId) {
    return redirectTo(home);
  }

  await voidAndRecord({ order, transactionId: signed.transactionId });

  return redirectTo(home);
}

/**
 * The money goes back: voided if Hyp will, otherwise recorded as owed.
 *
 * Same-day, before settlement, `CancelTrans` voids the transaction and it never
 * reaches the card statement. If that is not possible — a different day, no
 * transaction id, or the provider refuses — the order records that a refund is
 * owed and the artist makes it by hand. Which of the two happened is written to
 * the order; see `recordUnfulfillableOrder` and migration 010.
 *
 * `recordUnfulfillableOrder` writes only to a **pending** order. A charge
 * against an order that is already settled, or against none at all, has no row
 * to carry the obligation — so it is logged at full volume for the console
 * reconciliation api.md describes, and that log line is the whole record.
 */
async function voidAndRecord({ order, transactionId }) {
  const voided = transactionId
    ? await cancelTransaction({ transactionId })
    : { ok: false, error: 'noTransactionId' };

  if (!voided.ok) {
    console.error('[payments] COULD NOT VOID A CHARGE THAT MUST BE REFUNDED', {
      order: order?.id ?? null,
      transactionId,
      reason: voided.error,
    });
  }

  if (!order || order.status !== 'pending') {
    console.error('[payments] NO PENDING ORDER TO RECORD THIS CHARGE AGAINST', {
      order: order?.id ?? null,
      orderStatus: order?.status ?? null,
      transactionId,
      voided: voided.ok,
    });
    if (!voided.ok) logUnrecordedRefund({ order, transactionId, voided });
    return;
  }

  await recordUnfulfillableOrder({
    orderId: order.id,
    paymentReference: transactionId,
    voided: voided.ok,
  });
}

/**
 * A second, genuine charge against an order that is already settled: void it,
 * and touch nothing else.
 *
 * Nothing is written anywhere, deliberately. The order belongs to the first
 * payment, and there is no row that could carry this one's refund without
 * misdescribing that order. **So a failed void is visible only in the logs** —
 * a residual deployment.md records, with the phrase to search for.
 *
 * A refresh of the same return arrives here again and sends the void again.
 * It moves no money, since the transaction is already voided; what it can
 * produce is a 920 and a refund-owed line for money that has already gone
 * back, which is why that line says where to check.
 */
async function voidDuplicateCharge({ order, transactionId }) {
  console.error('[payments] SECOND CHARGE FOR A SETTLED ORDER — VOIDING', {
    order: order?.id ?? null,
    orderStatus: order?.status ?? null,
    recordedReference: order?.paymentReference ?? null,
    transactionId,
  });

  const voided = await cancelTransaction({ transactionId });

  if (voided.ok) {
    console.error('[payments] second charge voided', { order: order?.id ?? null, transactionId });
    return;
  }

  logUnrecordedRefund({ order, transactionId, voided });
}

/** The one line that is the whole record of a refund owed. */
function logUnrecordedRefund({ order, transactionId, voided }) {
  console.error(UNRECORDED_REFUND, {
    refundOwedFor: transactionId ?? 'a transaction Hyp did not name — find it in the console by the order',
    order: order?.id ?? null,
    reason: voided.error,
    ccode: voided.ccode ?? null,
    ...(voided.ccode === '920' ? { note: ALREADY_VOIDED_NOTE } : {}),
  });
}
