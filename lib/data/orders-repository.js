/**
 * Orders: pricing a checkout, and writing one down.
 *
 * The second data module, beside `works-repository.js`, and it follows the same
 * three rules — every function async, plain serializable objects out, and this
 * plus the works repository are the only modules that touch the database. See
 * .claude/rules/data-layer.md.
 *
 * **Every amount in here is agorot**, read from `works.price_agorot` and written
 * to `orders.total_agorot`. Nothing in this file multiplies or divides by 100,
 * and nothing here ever reads a shekel figure from a caller. That is the rule
 * api.md states: the server computes what is charged from its own records, and a
 * price that has been through a float and back is not that record.
 *
 * **An order is a historical record.** It says what was true when money moved,
 * so the line prices are copied rather than joined to, the delivery fee is
 * stored rather than recomputed, and nothing that later happens to the catalogue
 * may change what it says. See commerce.md and migration 009.
 *
 * It does not check who is calling. Checkout is public — guest checkout, no
 * accounts — and the only thing it can be asked to do is buy a painting that is
 * currently for sale. It does not validate either: `lib/checkout/checkout-input.js`
 * does that, and hands this module values it has already checked.
 */
import { getPool } from '@/lib/db';
import { deliveryFeeAgorot, offeredDeliveryMethods } from '@/lib/delivery';
import { getSiteSettings } from '@/lib/data/settings-repository';

/* ------------------------------------------------------------------ *
 * Pricing
 *
 * One helper does the arithmetic for both the page that shows a total and the
 * transaction that charges one, so the figure a buyer reads and the figure they
 * are charged cannot be computed two different ways.
 * ------------------------------------------------------------------ */

/**
 * The amount a work would actually be charged at, in agorot.
 *
 * `coalesce(price_reduced_agorot, price_agorot)` — the reduced price wins where
 * there is one, which is the same rule `chargeableAmount` applies in
 * `lib/cart/cart-contents.js`. A discounted work is still `available`: this is a
 * price, never a status. See commerce.md.
 */
const CHARGEABLE_AGOROT = 'coalesce(price_reduced_agorot, price_agorot)';

/**
 * Prices a set of works for checkout, and says which of them cannot be sold.
 *
 * **Public-scoped and buyable-only, both checked here rather than trusted from a
 * caller.** `published_at is not null` keeps a draft unbuyable however its id was
 * obtained, and `status = 'available'` is the one status that can be bought —
 * spelled as the literal the database constrains rather than imported from the
 * presentation table, because this is the money path and it must not depend on a
 * component's idea of a state. `components/ui/statusPresentation.js` carries the
 * same single truth for the UI; if a fifth status ever becomes buyable, both
 * change, and that is deliberate friction.
 *
 * @param {object} runner - A pool or a transaction client.
 * @param {string[]} workIds
 * @param {boolean} lock - `for update` on the matched rows. True inside the
 *   transaction that writes the order, so two simultaneous checkouts for one
 *   painting queue rather than race.
 */
async function readPricedWorks(runner, workIds, lock) {
  const { rows } = await runner.query(
    `select id::text              as id,
            title_he, title_en,
            status,
            price_currency,
            published_at is not null as published,
            ${CHARGEABLE_AGOROT} as chargeable_agorot
       from works
      where id::text = any($1::text[])
      ${lock ? 'for update' : ''}`,
    [workIds]
  );

  return rows;
}

/**
 * Turns those rows into the two lists a checkout needs, keeping the caller's
 * order — the order a cart was built in is a fact about the visit.
 */
function splitByAvailability(rows, workIds) {
  const byId = new Map(rows.map((row) => [row.id, row]));

  const sellable = [];
  const unavailable = [];

  for (const id of workIds) {
    const row = byId.get(id);

    /*
      An id that resolves to nothing at all is unavailable for the same reason a
      sold one is, and it is reported the same way. Unlike the cart there is no
      third category here: at the moment of paying, "we cannot sell you this" is
      one answer however it came about.
    */
    if (!row || !row.published || row.status !== 'available') {
      unavailable.push({
        id,
        title: row ? { he: row.title_he, en: row.title_en } : null,
      });
      continue;
    }

    sellable.push({
      workId: row.id,
      title: { he: row.title_he, en: row.title_en },
      priceAgorot: Number(row.chargeable_agorot),
      currency: row.price_currency,
    });
  }

  return { sellable, unavailable };
}

/**
 * Agorot to whole shekels, for **display only**.
 *
 * The mirror of `toMajorUnits` in the works repository, and here for the same
 * reason: `lib/format.js` renders whole shekels, the database stores minor units,
 * and the conversion belongs in the data layer rather than at each call site.
 * Every figure this module hands out carries both — the integer that will be
 * charged and the major-unit copy that will be printed — so nothing upstream ever
 * has a reason to multiply or divide money.
 */
function toMajorUnits(agorot) {
  return agorot / 100;
}

/**
 * What a checkout would cost, in agorot, without writing anything.
 *
 * What the checkout page draws its summary from. The total is built here rather
 * than in the page or the browser precisely because it is the figure that will
 * be charged: the page receives agorot and formats them once, and never adds a
 * delivery fee to a shekel amount.
 *
 * It is a **quote and not a promise.** `createPendingOrder` prices the same works
 * again inside its own transaction and does not trust this result — between a
 * page rendering and a form being submitted a painting can sell on under1000,
 * and the artist can change the shipping rate or stop offering pickup.
 *
 * **It prices only the methods offered today**, at today's rate, both read from
 * the site settings. A method that is switched off is simply absent from
 * `methods`, which is how the form knows not to draw it.
 *
 * @param {string[]} workIds
 * @returns {Promise<{sellable: object[], unavailable: object[], subtotalAgorot: number, subtotal: object, currency: string, methods: Record<string, {deliveryFeeAgorot: number, totalAgorot: number, deliveryFee: object, total: object}>}>}
 */
export async function quoteCheckout(workIds) {
  const ids = Array.isArray(workIds) ? workIds : [];

  const delivery = await readDeliveryTerms();

  if (ids.length === 0) return priceQuote({ sellable: [], unavailable: [] }, delivery);

  const rows = await readPricedWorks(getPool(), ids, false);
  return priceQuote(splitByAvailability(rows, ids), delivery);
}

/**
 * What delivery costs today and which methods are on offer, from the site
 * settings — the one place those are written. See migration 011.
 *
 * Read afresh for every quote and every order, never cached: the rate is what
 * the buyer is about to be charged, and a cached copy of a changed rate is
 * precisely the "amount they were not shown" the checkout refuses.
 */
async function readDeliveryTerms() {
  const settings = await getSiteSettings();

  return {
    shippingFeeAgorot: settings.shippingFeeAgorot,
    methods: offeredDeliveryMethods(settings.selfPickupOffered),
  };
}

/**
 * The arithmetic, in one place. Integers throughout, then one conversion for
 * printing.
 *
 * **It prices every delivery method rather than the one that was chosen**, and
 * that is what keeps money arithmetic out of the browser entirely. The checkout
 * form has to show the total moving as the buyer picks between two radios; the
 * alternative to handing it both figures is handing it a subtotal and a fee and
 * letting it add them, which is exactly the "computed from the cart's shekel
 * values" the rules forbid. Two methods, two totals, both computed here from
 * `price_agorot`.
 *
 * **The delivery fee is never charged on nothing.** An empty sellable list totals
 * zero rather than the fee alone, so a cart whose last painting sold between the
 * page rendering and the form being submitted cannot produce a 40 ILS charge for
 * delivering nothing.
 */
function priceQuote({ sellable, unavailable }, delivery) {
  const subtotalAgorot = sellable.reduce((sum, line) => sum + line.priceAgorot, 0);

  /*
    One currency per order, governing every line — 003 is explicit that stating it
    twice is how two places come to disagree. The column defaults to ILS and the
    admin has no field to change it, so the first line names it for the order.
  */
  const currency = sellable[0]?.currency ?? 'ILS';

  /** @type {Record<string, object>} */
  const methods = {};

  for (const method of delivery.methods) {
    const feeAgorot =
      sellable.length === 0 ? 0 : deliveryFeeAgorot(method, delivery.shippingFeeAgorot);
    const totalAgorot = subtotalAgorot + feeAgorot;

    methods[method] = {
      deliveryFeeAgorot: feeAgorot,
      totalAgorot,
      deliveryFee: { amount: toMajorUnits(feeAgorot), currency },
      total: { amount: toMajorUnits(totalAgorot), currency },
    };
  }

  return {
    sellable,
    unavailable,
    subtotalAgorot,
    subtotal: { amount: toMajorUnits(subtotalAgorot), currency },
    currency,
    methods,
  };
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * Creates a `pending` order and its lines, or refuses and writes nothing.
 *
 * **One transaction, and the works are locked inside it.** The prices are read
 * again here rather than taken from the quote the page showed, because the only
 * moment that matters is this one. `for update` means two people checking out
 * the same painting at the same instant queue behind each other instead of both
 * being told yes.
 *
 * **It writes no payment state and no sale.** The order is `pending`, the works
 * are untouched, and nothing is marked sold — that happens only when a verified
 * payment comes back, by a conditional write at that moment. See api.md on who
 * may write payment state, and commerce.md on why there is no reservation.
 *
 * **The order's id is its public reference.** `gen_random_uuid()` is a v4 uuid:
 * long, random and non-sequential, which is what lets `/[locale]/order/[id]` be
 * reachable by the person who placed it and nobody else. It is also what goes
 * into the payment provider's `Order` parameter, so the return trip can find its
 * way back to this row.
 *
 * @param {object} input
 * @param {string[]} input.workIds
 * @param {{name: string, email: string, phone: string, address: string|null}} input.buyer
 * @param {string} input.deliveryMethod
 * @param {string} input.locale - The language the buyer was reading. Required,
 *   and unrecoverable afterwards: the confirmation and the tax invoice depend
 *   on it. See i18n.md.
 * @param {number|null} input.expectedTotalAgorot - The total the buyer was
 *   looking at when they pressed pay, for the method they chose. **Used only to
 *   refuse, never to charge**: it arrives from the browser, so it is compared
 *   against the total computed here and nothing is ever written from it.
 * @returns {Promise<{ok: true, order: object} |
 *   {ok: false, error: string, unavailable?: object[], quote?: object}>}
 *   `amountChanged` and `deliveryNotOffered` carry the fresh `quote`, so the
 *   form can show the buyer what paying now would actually cost.
 */
export async function createPendingOrder({
  workIds,
  buyer,
  deliveryMethod,
  locale,
  expectedTotalAgorot,
}) {
  const ids = Array.isArray(workIds) ? [...new Set(workIds)] : [];

  if (ids.length === 0) return { ok: false, error: 'empty' };

  /*
    Read before the transaction opens, so the works are not held locked while a
    second connection answers a question that does not depend on them.
  */
  const delivery = await readDeliveryTerms();

  const client = await getPool().connect();

  try {
    await client.query('begin');

    const rows = await readPricedWorks(client, ids, true);
    const quote = priceQuote(splitByAvailability(rows, ids), delivery);
    /* The chosen method's figures, computed above from price_agorot like every other. */
    const charged = quote.methods[deliveryMethod];

    /*
      Refused, not partially fulfilled. Dropping the unavailable paintings and
      charging for the rest would be deciding on somebody's behalf what they
      meant to buy, at the moment they are about to pay for it.
    */
    if (quote.unavailable.length > 0) {
      await client.query('rollback');
      return { ok: false, error: 'unavailable', unavailable: quote.unavailable };
    }

    /*
      The method was switched off between the page rendering and the submit —
      validation checks this too, but against a read a moment older than this
      one. Nothing is written for a delivery the artist no longer offers.
    */
    if (!charged) {
      await client.query('rollback');
      return { ok: false, error: 'deliveryNotOffered', quote };
    }

    /*
      **A buyer is never charged an amount they were not shown.** The total is
      re-priced here from price_agorot and the current rate, which is correct —
      and it is exactly what makes a rate changed, or a price edited, while the
      page sat open reach the payment page unannounced. So the figure on their
      screen is compared with the one about to be charged, and any difference
      stops the checkout before an order exists or Hyp is asked for anything.
      The buyer sees the new total and confirms again; the second press carries
      the new figure and goes through. The whole total rather than only the fee,
      because a price edit is the same failure by another route.
    */
    if (charged.totalAgorot !== expectedTotalAgorot) {
      await client.query('rollback');
      return { ok: false, error: 'amountChanged', quote };
    }

    const { rows: orderRows } = await client.query(
      `insert into orders (
         status, buyer_name, buyer_email, buyer_phone, shipping_address,
         total_agorot, buyer_locale, delivery_method, delivery_fee_agorot
       )
       values ('pending', $1, $2, $3, $4, $5, $6, $7, $8)
       returning id::text as id,
                 status,
                 total_agorot,
                 delivery_method,
                 delivery_fee_agorot,
                 buyer_locale,
                 created_at`,
      [
        buyer.name,
        buyer.email,
        buyer.phone,
        /* Null for self-pickup, which the database requires rather than permits. */
        buyer.address ?? null,
        charged.totalAgorot,
        locale,
        deliveryMethod,
        charged.deliveryFeeAgorot,
      ]
    );

    const order = orderRows[0];

    /*
      One statement rather than a loop: unnest pairs the two arrays, so a
      five-painting order is one round trip. The unique index on
      (order_id, work_id) means a duplicated id would be refused here — and the
      caller already de-duplicated, so this is the database holding the rule
      rather than a second place enforcing it.
    */
    await client.query(
      `insert into order_lines (order_id, work_id, price_agorot)
       select $1, unnest($2::uuid[]), unnest($3::int[])`,
      [
        order.id,
        quote.sellable.map((line) => line.workId),
        quote.sellable.map((line) => line.priceAgorot),
      ]
    );

    await client.query('commit');

    return {
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        totalAgorot: order.total_agorot,
        deliveryMethod: order.delivery_method,
        deliveryFeeAgorot: order.delivery_fee_agorot,
        buyerLocale: order.buyer_locale,
        lines: quote.sellable,
      },
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    /* Always, or the pool leaks a connection per failed checkout. */
    client.release();
  }
}

/**
 * One order, by its id — which is also its public reference.
 *
 * Used by the payment return to find out which language to answer in, and by
 * the confirmation page. It returns the order without its lines for now;
 * whatever renders a receipt will want them and can ask for them then.
 *
 * @param {string} id
 * @returns {Promise<object|null>} null when nothing matches, including when the
 *   id is not a uuid at all — compared as text, like every lookup in the works
 *   repository, so a malformed reference answers "no" instead of raising.
 */
export async function getOrderById(id) {
  if (!id) return null;

  const { rows } = await getPool().query(
    `select id::text as id,
            status,
            total_agorot,
            delivery_method,
            delivery_fee_agorot,
            buyer_locale,
            buyer_name,
            shipping_address,
            payment_reference,
            created_at
       from orders
      where id::text = $1`,
    [id]
  );

  if (rows.length === 0) return null;

  const row = rows[0];

  return {
    id: row.id,
    status: row.status,
    totalAgorot: row.total_agorot,
    deliveryMethod: row.delivery_method,
    deliveryFeeAgorot: row.delivery_fee_agorot,
    buyerLocale: row.buyer_locale,
    buyerName: row.buyer_name,
    shippingAddress: row.shipping_address,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ *
 * Settling a verified payment
 *
 * Everything below runs only after `lib/payments/hyp.js` has validated a return
 * with the provider. Nothing here decides whether a payment happened; it decides
 * what is true afterwards.
 * ------------------------------------------------------------------ */

/**
 * Seizes every painting in an order and marks the order paid — or writes nothing.
 *
 * **One transaction, and the database decides.** The works are taken by a single
 * conditional statement, and the count of rows it actually changed is the answer
 * to whether we won: matched every line, or matched fewer and the whole thing
 * rolls back. There is no read-then-write and therefore no window between
 * checking and taking.
 *
 * **It deliberately does not use `markWorkSold`**, and that is worth stating
 * because reusing it looks obvious and is wrong twice over:
 *
 * - It guards on the sale channel and **not on the status**, so it will happily
 *   re-mark a painting that is already sold — which is exactly what must not
 *   happen when two buyers reach the return seconds apart.
 * - On a replay it returns false for a work already carrying `this-site`,
 *   because its `where` clause excludes that channel. Read as "did I win", that
 *   is a false negative: it would report a lost race for a painting this very
 *   order already bought, and send a refund to somebody who owns the painting.
 *
 * So the condition here is `status = 'available'` and nothing else.
 *
 * **Publication is deliberately not part of that condition.** A work the artist
 * unpublished while a buyer was paying is hidden, not sold; refusing the seizure
 * would refund somebody for a painting that is sitting right there. Visibility
 * and availability are separate axes everywhere else in this codebase and they
 * stay separate here. See commerce.md.
 *
 * **Marking paid is idempotent on the order.** A buyer who refreshes the return
 * URL — or presses back onto it — arrives here again with the same reference.
 * The order row is locked and read first, so a second pass sees `paid`, writes
 * nothing at all, and reports `alreadyPaid`. That check has to come **before**
 * the seizure: by then the paintings are already sold to this order, so the
 * conditional update would match nothing and the race branch would fire against
 * the buyer who actually won.
 *
 * @param {object} input
 * @param {string} input.orderId
 * @param {string} input.paymentReference - The provider's transaction id, from
 *   the verified return. Unique where present, so the database refuses the same
 *   payment being recorded against two orders.
 * @returns {Promise<{outcome: 'paid'|'alreadyPaid'|'lost'|'notFound'|'notPending'|'referenceInUse',
 *                    order?: object, lostWorkIds?: string[]}>}
 */
export async function settlePaidOrder({ orderId, paymentReference }) {
  if (!orderId) return { outcome: 'notFound' };

  const client = await getPool().connect();

  try {
    await client.query('begin');

    /*
      Locked before anything is read off it. Two returns for one order arriving
      together — a refresh racing the original, or two tabs — queue here rather
      than both deciding they are the first.
    */
    const { rows: orderRows } = await client.query(
      `select id::text as id, status, buyer_locale, payment_reference,
              total_agorot, delivery_method, delivery_fee_agorot
         from orders
        where id::text = $1
        for update`,
      [orderId]
    );

    if (orderRows.length === 0) {
      await client.query('rollback');
      return { outcome: 'notFound' };
    }

    const order = orderRows[0];

    /* The replay. Nothing is written and nothing is undone. */
    if (order.status === 'paid') {
      await client.query('rollback');
      return { outcome: 'alreadyPaid', order: toOrder(order) };
    }

    /*
      Anything else — cancelled, refunded, already shipped — is not ours to move.
      A return arriving against one of those is reported rather than acted on.
    */
    if (order.status !== 'pending') {
      await client.query('rollback');
      return { outcome: 'notPending', order: toOrder(order) };
    }

    const { rows: lineRows } = await client.query(
      'select work_id::text as work_id from order_lines where order_id = $1',
      [order.id]
    );

    const workIds = lineRows.map((row) => row.work_id);

    if (workIds.length === 0) {
      /* An order with no lines cannot be fulfilled and must not be marked paid. */
      await client.query('rollback');
      return { outcome: 'lost', order: toOrder(order), lostWorkIds: [] };
    }

    /*
      The seizure. One statement, and `returning` is what says which paintings we
      actually got — the count decides, not anything this code believed a moment
      earlier.
    */
    const { rows: seized } = await client.query(
      `update works
          set status = 'sold',
              sale_channel = 'this-site',
              updated_at = now()
        where id = any($1::uuid[])
          and status = 'available'
      returning id::text as id`,
      [workIds]
    );

    if (seized.length !== workIds.length) {
      /*
        All or nothing. Rolling back releases the paintings we did get, because a
        half-fulfilled order is worse than a refused one: it would sell somebody
        two of the four paintings they paid for and leave nothing saying so.
      */
      await client.query('rollback');

      const taken = new Set(seized.map((row) => row.id));

      return {
        outcome: 'lost',
        order: toOrder(order),
        lostWorkIds: workIds.filter((id) => !taken.has(id)),
      };
    }

    const { rows: paidRows } = await client.query(
      `update orders
          set status = 'paid',
              paid_at = now(),
              payment_reference = $2,
              updated_at = now()
        where id::text = $1
      returning id::text as id, status, buyer_locale, payment_reference,
                total_agorot, delivery_method, delivery_fee_agorot`,
      [orderId, paymentReference]
    );

    await client.query('commit');

    return { outcome: 'paid', order: toOrder(paidRows[0]) };
  } catch (error) {
    await client.query('rollback');

    /*
      The unique index on payment_reference. It means this transaction is already
      recorded against a different order, which is a provider-level mix-up rather
      than something a buyer did — so nothing is written and it is reported by
      name instead of surfacing as a constraint violation.
    */
    if (error?.code === '23505') {
      console.error('[orders] payment reference already recorded', { orderId, error: error.detail });
      return { outcome: 'referenceInUse' };
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records an order that was paid for and cannot be fulfilled.
 *
 * The losing side of the race: the money moved, another buyer got the painting,
 * and the only question left is whether the charge was undone automatically.
 * Both answers are states the order carries, and which one it is decides what
 * the artist has to do.
 *
 * - **`voided`** — the same-day cancellation succeeded. The order is `cancelled`
 *   with its `cancelled_at`, and it still records `paid_at`, because money did
 *   move before it was voided. 007 left `cancelled` free to carry a payment date
 *   for exactly this shape, and keeping it is what makes the transaction
 *   traceable afterwards.
 * - **not voided** — the charge stands and has to be given back by hand. The
 *   order is `paid`, which is true, and `refund_due_at` is what says a refund is
 *   owed on top of it. See migration 010 for why that is a column rather than a
 *   seventh status.
 *
 * **Conditional on the order still being pending**, so a refreshed return cannot
 * write this twice or overwrite a settlement that has since happened.
 *
 * @param {object} input
 * @param {string} input.orderId
 * @param {string} input.paymentReference
 * @param {boolean} input.voided - Whether the provider confirmed the void.
 * @returns {Promise<{ok: boolean, outcome: 'voided'|'refundDue'|'unchanged'}>}
 */
export async function recordUnfulfillableOrder({ orderId, paymentReference, voided }) {
  if (!orderId) return { ok: false, outcome: 'unchanged' };

  const statement = voided
    ? `update orders
          set status = 'cancelled',
              paid_at = coalesce(paid_at, now()),
              cancelled_at = now(),
              payment_reference = $2,
              updated_at = now()
        where id::text = $1 and status = 'pending'`
    : `update orders
          set status = 'paid',
              paid_at = now(),
              refund_due_at = now(),
              payment_reference = $2,
              updated_at = now()
        where id::text = $1 and status = 'pending'`;

  try {
    const { rowCount } = await getPool().query(statement, [orderId, paymentReference]);

    if (rowCount === 0) return { ok: false, outcome: 'unchanged' };

    return { ok: true, outcome: voided ? 'voided' : 'refundDue' };
  } catch (error) {
    if (error?.code !== '23505') throw error;

    /*
      The payment reference is already recorded against some other order, so the
      unique index refused this write.

      **The obligation matters more than the reference.** Losing the write
      entirely would leave an order sitting at `pending` with a real charge
      against it and nothing anywhere saying a refund is owed — money quietly
      kept, which is the one outcome this whole branch exists to prevent. So it
      is written again without the reference, and the collision is logged loudly
      for the console reconciliation instead.

      This was found by a simulated return replaying one transaction id across
      several orders. A real provider does not reuse them, so it should never
      fire — but "should never" is not a reason to fail silently about money.
    */
    console.error('[orders] REFERENCE COLLISION recording an unfulfillable order', {
      orderId,
      paymentReference,
      detail: error.detail,
    });

    /* Only $1 survives the rewrite, so only $1 may be bound. */
    const withoutReference = statement.replace('payment_reference = $2,', '');
    const { rowCount } = await getPool().query(withoutReference, [orderId]);

    if (rowCount === 0) return { ok: false, outcome: 'unchanged' };

    return { ok: true, outcome: voided ? 'voided' : 'refundDue' };
  }
}

/** Shapes an order row the way every read here returns one. */
function toOrder(row) {
  return {
    id: row.id,
    status: row.status,
    buyerLocale: row.buyer_locale,
    paymentReference: row.payment_reference,
    totalAgorot: row.total_agorot,
    deliveryMethod: row.delivery_method,
    deliveryFeeAgorot: row.delivery_fee_agorot,
  };
}

/**
 * One order and everything the confirmation page has to say about it.
 *
 * **The lines are joined to `works` for their titles rather than re-read through
 * the works repository**, and that is the historical-record rule applied to a
 * page: the repository's reads are public-scoped, so a painting the artist
 * unpublished the following week would simply vanish from the confirmation of an
 * order somebody had already paid for. What was bought does not change because
 * the catalogue did.
 *
 * The **price on each line is the order's**, never the work's current one, for
 * the same reason `order_lines.price_agorot` is copied at all. The slug is read
 * so the confirmation can still link to the painting; a work that has since been
 * unpublished gives a link that 404s, which is a smaller wrong than a receipt
 * that forgets what it sold.
 *
 * **No buyer name, no address.** This page is reached by the order id alone,
 * with no account and no session, so whoever holds the link sees what it
 * shows; the page renders neither, so neither is read. The admin order page is
 * the place for them, behind the guard.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getOrderForConfirmation(id) {
  if (!id) return null;

  const { rows } = await getPool().query(
    `select id::text as id,
            status,
            buyer_locale,
            delivery_method,
            delivery_fee_agorot,
            total_agorot,
            currency,
            refund_due_at is not null as refund_due,
            created_at
       from orders
      where id::text = $1`,
    [id]
  );

  if (rows.length === 0) return null;

  const order = rows[0];

  const { rows: lineRows } = await getPool().query(
    `select l.work_id::text as work_id,
            l.price_agorot,
            w.title_he, w.title_en,
            w.slug_he, w.slug_en
       from order_lines l
       join works w on w.id = l.work_id
      where l.order_id::text = $1
      order by w.title_he`,
    [id]
  );

  return {
    id: order.id,
    status: order.status,
    buyerLocale: order.buyer_locale,
    deliveryMethod: order.delivery_method,
    refundDue: order.refund_due,
    createdAt: order.created_at,
    deliveryFee: {
      amount: toMajorUnits(order.delivery_fee_agorot),
      currency: order.currency,
    },
    total: { amount: toMajorUnits(order.total_agorot), currency: order.currency },
    lines: lineRows.map((line) => ({
      workId: line.work_id,
      title: { he: line.title_he, en: line.title_en },
      slug: { he: line.slug_he, en: line.slug_en },
      price: { amount: toMajorUnits(line.price_agorot), currency: order.currency },
    })),
  };
}

/* ------------------------------------------------------------------ *
 * The admin's orders
 *
 * Reads and writes for the two pages the artist actually works from. Every one
 * of them is admin-facing: none is public-scoped, and none may be reached from
 * anything a visitor renders.
 * ------------------------------------------------------------------ */

/**
 * How old a `pending` order has to be before it is worth looking at.
 *
 * **This constant is the whole of the reconciliation net.** With no webhook and
 * no transaction-status query, a buyer who pays and closes the window before the
 * redirect leaves an order that looks exactly like one nobody ever paid for —
 * and nothing server-side can tell the two apart, ever. See api.md.
 *
 * An hour is long enough that an order somebody is still filling in a card for
 * is not flagged, and short enough that a real payment is noticed the same day.
 */
const STALE_PENDING_INTERVAL = '1 hour';

/**
 * How long after dispatch an unmarked receipt becomes worth chasing.
 *
 * **The 14-day cancellation window is counted from receipt**, so an order that
 * ships and is never marked delivered has no computable window at all — it sits
 * at `shipped` with `delivered_at` null, indistinguishable from a parcel still in
 * transit. No constraint can make somebody confirm a delivery and a default date
 * would be invented and then counted from, so the only remedy is a person. See
 * commerce.md and migration 007.
 *
 * **Why a threshold rather than flagging every dispatch immediately.** The window
 * is uncomputable from the moment it ships, so on strict reading every posted
 * order qualifies — but a block listing every parcel sent this morning is a block
 * she stops reading, which is precisely how "which orders are still on the way"
 * stopped being answerable in the first place. Seven days is comfortably longer
 * than insured domestic delivery in Israel, so an order still open after it is
 * either lost or simply unmarked. Both want a person.
 */
const UNCLOSED_DISPATCH_INTERVAL = '7 days';

/**
 * Every order, newest first.
 *
 * **This list is the artist's only notification that anything sold.** Nothing
 * emails her, nothing texts her, and the provider sends nothing either — so what
 * this page shows is the entire mechanism by which she finds out. It carries the
 * painting titles for that reason: "an order" is not news, "לימונים sold" is.
 *
 * Three flags travel with each row, and every one is a question no schema can
 * answer on its own — which is why they are computed here rather than being
 * constraints somewhere:
 *
 * - **`refundDue`** — money taken for a painting that could not be delivered and
 *   a charge that could not be voided. Nothing automates the refund; she makes it
 *   by hand.
 * - **`stalePending`** — pending for over an hour. Possibly a buyer who paid and
 *   closed the window, and the only way to find out is the Hyp console.
 * - **`unclosedDispatch`** — posted a week ago and never marked as arrived. Its
 *   14-day cancellation window is counted from receipt, so until somebody marks
 *   it received the window cannot be computed at all.
 *
 * @returns {Promise<object[]>}
 */
export async function getOrdersForAdmin() {
  const { rows } = await getPool().query(
    `select o.id::text            as id,
            o.status,
            o.delivery_method,
            o.total_agorot,
            o.currency,
            o.buyer_name,
            o.created_at,
            o.paid_at,
            o.refund_due_at is not null                                as refund_due,
            (o.status = 'pending'
              and o.created_at < now() - interval '${STALE_PENDING_INTERVAL}') as stale_pending,
            /*
              Posted, never marked as arrived. The null receipt is stated rather
              than inferred from the status: nothing in the schema forbids a
              shipped row from carrying a receipt date, so reading the status
              alone would be trusting a coincidence.
            */
            (o.status = 'shipped'
              and o.delivered_at is null
              and o.shipped_at < now() - interval '${UNCLOSED_DISPATCH_INTERVAL}')
              as unclosed_dispatch,
            o.shipped_at,
            coalesce(
              array_agg(w.title_he order by w.title_he)
                filter (where w.id is not null),
              '{}'
            ) as titles
       from orders o
       left join order_lines l on l.order_id = o.id
       left join works w       on w.id = l.work_id
      group by o.id
      order by o.created_at desc`
  );

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    deliveryMethod: row.delivery_method,
    total: { amount: toMajorUnits(row.total_agorot), currency: row.currency },
    buyerName: row.buyer_name,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    refundDue: row.refund_due,
    stalePending: row.stale_pending,
    unclosedDispatch: row.unclosed_dispatch,
    shippedAt: row.shipped_at,
    titles: row.titles ?? [],
  }));
}

/**
 * One order, with everything the detail page shows.
 *
 * Admin-scoped by being here at all: it returns the buyer's name, address, email
 * and phone, which nothing public may render.
 *
 * The lines are joined to `works` for their titles rather than read through the
 * works repository, for the reason `getOrderForConfirmation` does the same — the
 * repository's reads are public-scoped, and a painting unpublished afterwards
 * would vanish from the record of an order somebody paid for.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getOrderForAdmin(id) {
  if (!id) return null;

  const { rows } = await getPool().query(
    `select id::text as id, status, buyer_name, buyer_email, buyer_phone,
            shipping_address, delivery_method, delivery_fee_agorot,
            total_agorot, currency, buyer_locale, payment_reference,
            created_at, paid_at, shipped_at, delivered_at, cancelled_at,
            refunded_at, refund_due_at
       from orders
      where id::text = $1`,
    [id]
  );

  if (rows.length === 0) return null;

  const order = rows[0];

  const { rows: lineRows } = await getPool().query(
    `select l.work_id::text as work_id, l.price_agorot,
            w.title_he, w.status as work_status, w.sale_channel,
            w.published_at is not null as work_published
       from order_lines l
       join works w on w.id = l.work_id
      where l.order_id::text = $1
      order by w.title_he`,
    [id]
  );

  return {
    id: order.id,
    status: order.status,
    buyerName: order.buyer_name,
    buyerEmail: order.buyer_email,
    buyerPhone: order.buyer_phone,
    shippingAddress: order.shipping_address,
    deliveryMethod: order.delivery_method,
    deliveryFee: { amount: toMajorUnits(order.delivery_fee_agorot), currency: order.currency },
    total: { amount: toMajorUnits(order.total_agorot), currency: order.currency },
    buyerLocale: order.buyer_locale,
    paymentReference: order.payment_reference,
    refundDue: order.refund_due_at !== null,
    dates: {
      created: order.created_at,
      paid: order.paid_at,
      shipped: order.shipped_at,
      delivered: order.delivered_at,
      cancelled: order.cancelled_at,
      refunded: order.refunded_at,
      refundDue: order.refund_due_at,
    },
    lines: lineRows.map((line) => ({
      workId: line.work_id,
      title: line.title_he,
      price: { amount: toMajorUnits(line.price_agorot), currency: order.currency },
      workStatus: line.work_status,
      saleChannel: line.sale_channel,
      workPublished: line.work_published,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Moving an order forward
 * ------------------------------------------------------------------ */

/**
 * The forward steps, as conditions the database checks rather than rules this
 * code believes.
 *
 * **Every one of these is written so the `where` clause can only match a legal
 * transition**, which means the UI cannot produce a row the schema would refuse:
 * a button pressed twice, a stale page, or a hand-typed POST all match nothing
 * and change nothing rather than raising a constraint violation at the artist.
 *
 * The dates are `now()` in the same statement that moves the status, so they are
 * never typed and never drift from the thing they record — and because time only
 * moves forwards, 007's ordering constraints hold for free.
 *
 * `refund_due_at is null` on both: an order that owes a refund was never
 * fulfilled and has nothing to dispatch.
 */
const ADVANCES = Object.freeze({
  /** Posted. Shipping only — a pickup order never ships, and 009 enforces that. */
  shipped: {
    set: "status = 'shipped', shipped_at = now()",
    where: "status = 'paid' and delivery_method = 'shipping' and refund_due_at is null",
  },

  /**
   * Arrived, and the date the 14-day cancellation window is counted from.
   *
   * Two routes in, because a pickup order has no dispatch to pass through: a
   * shipped order becomes delivered, and a paid pickup order becomes delivered
   * directly when the artist hands the painting over. That second path is what
   * migration 009 opened.
   */
  delivered: {
    set: "status = 'delivered', delivered_at = now()",
    where:
      "refund_due_at is null and ((delivery_method = 'shipping' and status = 'shipped')" +
      " or (delivery_method = 'self-pickup' and status = 'paid'))",
  },
});

/**
 * Moves an order one step forward.
 *
 * @param {object} input
 * @param {string} input.orderId
 * @param {'shipped'|'delivered'} input.to
 * @returns {Promise<boolean>} False when the transition was not legal from where
 *   the order actually was — which is the same answer as "somebody pressed twice".
 */
export async function advanceOrder({ orderId, to }) {
  /*
    A step outside the closed set never reaches the database. `hasOwn`, because
    `to` is a bound argument the browser can change, and a plain lookup would
    find `constructor` or `toString` on the prototype and build SQL from it.
  */
  const advance = Object.hasOwn(ADVANCES, to) ? ADVANCES[to] : null;

  if (!orderId || !advance) return false;

  const { rowCount } = await getPool().query(
    `update orders
        set ${advance.set}, updated_at = now()
      where id::text = $1 and ${advance.where}`,
    [orderId]
  );

  return rowCount > 0;
}

/* ------------------------------------------------------------------ *
 * The exits
 * ------------------------------------------------------------------ */

/**
 * The statuses in which an order holds the paintings it paid for.
 *
 * `pending` is not one of them: a pending order reserved nothing and seized
 * nothing, so its paintings were never its to give back. Neither is an order
 * carrying `refund_due_at`, which lost the race and holds nothing either — that
 * is checked beside this list, not in it, because the status of such an order is
 * `paid`.
 */
const HOLDING_STATUSES = ['paid', 'shipped', 'delivered'];

/**
 * Returns the paintings an order holds, and takes them off the site.
 *
 * **An order releases only what it itself holds**, and "the painting is on this
 * order's lines and says sold" is not that. A line records what an order asked
 * for; three things can have happened to the painting since, and each was found
 * releasing somebody else's sale:
 *
 *   - **Another order bought it.** An abandoned pending order is cancelled after
 *     a second buyer paid for the same painting — the pending one never held it.
 *   - **It sold by hand on another channel.** The same abandoned order, after the
 *     artist sold the painting on under1000 and marked it here.
 *   - **It came back and sold again.** A refund recorded after the returned
 *     painting was put back on sale and bought through the site by somebody else.
 *
 * So a painting is released only when all three hold, in the `where` clause of
 * the statement that writes, with no read-then-decide window:
 *
 *   1. **This order held stock at all** — `heldStock`, decided by the caller from
 *      the status the order had *before* it was closed: one of
 *      `HOLDING_STATUSES`, and no refund owed.
 *   2. **The painting is sold through this site.** Sold on another channel, or
 *      not sold, it is somebody else's fact and is never touched.
 *   3. **No other holding order took it later.** Only one order can seize an
 *      available painting at a time, so when two holding orders name it, the one
 *      paid last is the one whose sale the painting's status records. The id
 *      breaks a tie in `paid_at` so the answer is never ambiguous. **An order
 *      that lost the race is never a later holder**, although its `paid_at` is
 *      always later than the winner's — its return arrived second. Voided, it is
 *      `cancelled`; not voided, it carries `refund_due_at`. Either way the
 *      filter below leaves it out, which is what lets the winner still be
 *      refunded.
 *
 * Derived rather than recorded: there is no `sold_by_order` column. Every fact
 * the rule needs is already in `order_lines` and `paid_at`, and a column would
 * be one more thing to keep in step with the seizure.
 *
 * **It deliberately does not use `returnWorkToSale`.** That function excludes
 * `sale_channel = 'this-site'` in its own `where` clause — on purpose, so the
 * works list cannot undo a site sale by hand and claim money went back. But every
 * painting sold through checkout carries exactly that channel, so calling it here
 * would match nothing, return false, and leave a refunded painting marked sold.
 * The same shape of trap as `markWorkSold` on the payment return, and refused for
 * the same reason.
 *
 * **They go back to draft rather than back on sale.** Unpublishing is the
 * difference between the site quietly re-listing a painting the moment a refund
 * is processed and the artist deciding it is for sale again — she may want to
 * re-photograph it, re-price it, or keep it. `published_at = null` is a
 * visibility change and the status is a separate axis; both move, and she
 * republishes deliberately. See commerce.md.
 *
 * **An order that owes a refund never held anything**, so nothing is released
 * for it. That is not a detail: the painting on such an order was won by
 * *another* buyer in the race, and releasing it here would take it away from
 * somebody who paid for it and is waiting for it.
 *
 * @param {object} client - Inside the caller's transaction.
 * @param {string} orderId
 * @param {boolean} heldStock - Whether this order held stock before it was closed.
 */
async function releaseOrderWorks(client, orderId, heldStock) {
  if (!heldStock) return 0;

  /*
    `paid_at` is read from the row inside the statement rather than passed in:
    closing an order does not change it, and a JavaScript Date would drop the
    microseconds Postgres compares on.
  */
  const { rowCount } = await client.query(
    `update works
        set status = 'available',
            sale_channel = null,
            published_at = null,
            updated_at = now()
      where id in (select work_id from order_lines where order_id::text = $1)
        and status = 'sold'
        and sale_channel = 'this-site'
        and not exists (
          select 1
            from order_lines later_line
            join orders later on later.id = later_line.order_id
           where later_line.work_id = works.id
             and later.id::text <> $1
             and later.status = any($2::text[])
             and later.refund_due_at is null
             and later.paid_at is not null
             and (later.paid_at, later.id::text) >
                 ((select paid_at from orders where id::text = $1), $1)
        )`,
    [orderId, HOLDING_STATUSES]
  );

  return rowCount;
}

/**
 * The two exits: cancelled, and refunded.
 *
 * One function because they differ in three literals and in nothing else that
 * matters — and because the release of the paintings, which is the part that can
 * do real damage, must be identical on both.
 *
 * - **`cancelled`** needs `cancelled_at` and is legal from `pending` or `paid`.
 * - **`refunded`** needs `paid_at` *and* `refunded_at`, so it is legal only from
 *   a status at or past paid. An order that was never paid has nothing to refund,
 *   and 007 refuses the row outright — which is why the `where` clause below
 *   names the statuses rather than trusting the page not to offer the button.
 *
 * Both release the paintings the order holds — and only those — in the same
 * transaction as the status change, so there is no window in which an order
 * says refunded while its painting still says sold. `released` is how many
 * paintings actually moved, which may be none.
 *
 * @param {object} input
 * @param {string} input.orderId
 * @param {'cancelled'|'refunded'} input.to
 * @returns {Promise<{ok: boolean, released: number}>}
 */
export async function closeOrder({ orderId, to }) {
  if (!orderId || (to !== 'cancelled' && to !== 'refunded')) {
    return { ok: false, released: 0 };
  }

  const client = await getPool().connect();

  try {
    await client.query('begin');

    const { rows } = await client.query(
      `select status, paid_at is not null as was_paid, refund_due_at is not null as refund_due
         from orders where id::text = $1 for update`,
      [orderId]
    );

    if (rows.length === 0) {
      await client.query('rollback');
      return { ok: false, released: 0 };
    }

    const current = rows[0];

    const statement =
      to === 'cancelled'
        ? `update orders
              set status = 'cancelled', cancelled_at = now(), updated_at = now()
            where id::text = $1 and status in ('pending', 'paid')`
        : `update orders
              set status = 'refunded', refunded_at = now(), updated_at = now()
            where id::text = $1
              and status in ('paid', 'shipped', 'delivered')
              and paid_at is not null`;

    const { rowCount } = await client.query(statement, [orderId]);

    if (rowCount === 0) {
      await client.query('rollback');
      return { ok: false, released: 0 };
    }

    /*
      Only an order that held the paintings can give them back, and that is a
      question about the status it had a moment ago, before this statement
      closed it. A pending order took nothing; an order owing a refund lost its
      paintings to whoever won the race. See `releaseOrderWorks`.
    */
    const heldStock =
      HOLDING_STATUSES.includes(current.status) && current.was_paid && !current.refund_due;
    const released = await releaseOrderWorks(client, orderId, heldStock);

    await client.query('commit');

    return { ok: true, released };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
