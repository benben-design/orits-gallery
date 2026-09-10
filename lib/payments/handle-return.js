import { NextResponse } from 'next/server';
import { verifyReturn, cancelTransaction } from '@/lib/payments/hyp';
import {
  getOrderById,
  settlePaidOrder,
  recordUnfulfillableOrder,
} from '@/lib/data/orders-repository';
import { CART_COOKIE_NAME } from '@/lib/cart/cart-contents';
import { CART_COOKIE_PATH } from '@/lib/cart/cart-cookie';
import { absoluteUrl } from '@/lib/site-url';
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
 * Hyp sends the browser to is a hint; `CCode` from VERIFY is the fact. A
 * "success" landing that fails verification changes nothing, and a landing on
 * the error URL that verifies as a genuine payment is still a genuine payment
 * and is settled — because the alternative is keeping money for a painting we
 * never marked sold, on the strength of which path a redirect took.
 *
 * The order of operations is the whole of the design:
 *
 *   1. **VERIFY first. Nothing happens before it.** Not a read that matters, not
 *      a write, not a cookie.
 *   2. A failed, absent or impossible verification changes **nothing anywhere**
 *      and the buyer is told the payment is not confirmed.
 *   3. A verified success seizes the paintings and marks the order paid in one
 *      transaction, and only then is the cart cleared.
 *
 * **Missing credentials can never read as success.** `verifyReturn` answers
 * `cannotVerify`, which lands in the same branch as a decline: no state changes.
 * That matters more than it looks right now, because there is no Hyp account
 * yet — every return this code has ever seen has taken that branch.
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
 * @param {Request & {nextUrl: URL}} request
 * @returns {Promise<NextResponse>}
 */
export async function handlePaymentReturn(request) {
  /*
    The raw query, exactly as it arrived and in its original order. It is what
    VERIFY has to replay: Hyp signs over the parameters as they were sent, so a
    query rebuilt from named fields fails the check with nothing in the response
    explaining why. It is never parsed and reassembled on the way to VERIFY.
  */
  const rawQuery = request.nextUrl.search.replace(/^\?/, '');
  const reference = request.nextUrl.searchParams.get('Order');

  /*
    Read before verification, and used for exactly one thing until verification
    has answered: which language to reply in. `buyer_locale` was captured at
    checkout precisely because it cannot be recovered afterwards, and it is what
    lets a fixed, language-blind return URL still land a Hebrew buyer on a Hebrew
    page. Nothing about this order is believed or changed on the strength of an
    unverified redirect.
  */
  const order = reference ? await getOrderById(reference) : null;
  const locale = order && isLocale(order.buyerLocale) ? order.buyerLocale : defaultLocale;

  const fallback = absoluteUrl(localeHref(locale, '/checkout'));

  /* ---- 1. Verify. Before anything else. ---- */

  const verified = await verifyReturn(rawQuery);

  if (!verified.ok) {
    /*
      A decline, a system error, a forged redirect, or no credentials to ask
      with. They are one branch on purpose: none of them is evidence that money
      moved, so none of them may move anything here. The order stays exactly as
      it was — pending, with no payment against it — and the page says the
      payment is not confirmed.
    */
    console.error('[payments] return not verified', {
      reason: verified.error,
      ccode: verified.ccode,
      order: reference,
    });

    return NextResponse.redirect(order ? orderDestination(locale, order.id) : fallback);
  }

  /* ---- 2. Verified. Now, and only now, state may change. ---- */

  /*
    Hyp's own transaction id, taken from the VERIFY response rather than from the
    redirect: the response is the provider speaking, the redirect is a URL the
    buyer could have edited. It becomes `payment_reference`, which is unique
    where present — the database's own last defence against one payment being
    recorded twice.
  */
  const paymentReference = verified.fields.Id || verified.fields.TransId || null;

  if (!order) {
    /*
      A verified payment we cannot attribute to an order. Nothing sensible can be
      written, and this is money, so it is logged at full volume for the console
      reconciliation that api.md describes.
    */
    console.error('[payments] VERIFIED PAYMENT WITH NO MATCHING ORDER', {
      order: reference,
      paymentReference,
    });

    return NextResponse.redirect(fallback);
  }

  const settled = await settlePaidOrder({ orderId: order.id, paymentReference });

  if (settled.outcome === 'paid' || settled.outcome === 'alreadyPaid') {
    const response = NextResponse.redirect(orderDestination(locale, order.id));

    /*
      **The cart is cleared here and nowhere else on this path.** Only a verified
      payment that actually became a paid order empties it — not a decline, not
      an unverifiable return, and not the race branch below, where the buyer
      keeps whatever else they had chosen.

      Deleted on the response rather than through `cookies()`, so it travels with
      the redirect itself. `alreadyPaid` clears again, which is a no-op on a
      refresh and the right answer if the first response never reached the
      browser.
    */
    response.cookies.delete({ name: CART_COOKIE_NAME, path: CART_COOKIE_PATH });

    return response;
  }

  if (settled.outcome === 'lost') {
    /*
      The worst branch in the product, and the one that cannot be exercised
      against Hyp until an account exists: the buyer paid, and somebody else got
      the painting in the seconds in between. Every painting is a one-off, so
      there is nothing to send.

      The money goes back immediately if it can. Same-day, before settlement,
      `CancelTrans` voids the transaction and it never reaches the card
      statement. If that is not possible — a different day, or the provider
      refuses — the order records that a refund is owed and the artist makes it
      by hand. Which of the two happened is written to the order; see
      `recordUnfulfillableOrder` and migration 010.
    */
    console.error('[payments] order lost the race after payment', {
      order: order.id,
      paymentReference,
      lostWorkIds: settled.lostWorkIds,
    });

    const voided = paymentReference
      ? await cancelTransaction({ transactionId: paymentReference })
      : { ok: false, error: 'unreadable' };

    if (!voided.ok) {
      console.error('[payments] COULD NOT VOID A CHARGE THAT MUST BE REFUNDED', {
        order: order.id,
        paymentReference,
        reason: voided.error,
      });
    }

    await recordUnfulfillableOrder({
      orderId: order.id,
      paymentReference,
      voided: voided.ok,
    });

    /* The cart is deliberately untouched: nothing was sold to this buyer. */
    return NextResponse.redirect(orderDestination(locale, order.id));
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

  return NextResponse.redirect(orderDestination(locale, order.id));
}
