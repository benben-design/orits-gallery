'use server';

/**
 * Submitting a checkout.
 *
 * A **Server Action**, not a route handler, for the reason api.md gives: a route
 * exists for what a third party must reach, and nothing third-party submits this
 * form. It is POST-only, has no URL of its own, and a card number never touches
 * it — the buyer enters that on Hyp's page, not ours.
 *
 * **There is no session check and that is not an omission.** Checkout is guest
 * checkout: no accounts, nothing to authenticate. What protects it is that it
 * trusts nothing — the works come from the server's own cookie or a bound
 * argument, every price is re-read from the database, and the total is computed
 * there. See security.md on never trusting an identity, a price or a total from a
 * request body.
 *
 * **The order of operations is the whole design**, and it is the order the brief
 * and api.md both require:
 *
 *   1. Validate what was typed.
 *   2. Re-verify every painting and write a `pending` order, in one transaction.
 *   3. Only then ask Hyp to sign a payment page.
 *   4. Redirect the buyer to it.
 *
 * The order exists **before** the buyer reaches the payment page, because the
 * alternative is a payment that comes back referring to nothing. This provider
 * gives us no webhook and no status query, so a redirect that finds no order is
 * unrecoverable — see api.md on the branch with no signal.
 *
 * **The cart is deliberately not cleared here.** Nothing has been paid for yet.
 * A buyer who abandons Hyp's page must come back to the cart they had.
 */
import { redirect } from 'next/navigation';
import { readCartIds } from '@/lib/cart/cart-cookie';
import { validateCheckoutInput } from './checkout-input';
import { createPendingOrder } from '@/lib/data/orders-repository';
import { createPaymentPage, isHypConfigured } from '@/lib/payments/hyp';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { interpolate } from '@/lib/i18n/interpolate';

/**
 * @param {string} locale - Bound server-side by the page, so it is the language
 *   the buyer was actually reading rather than a field a browser could edit. It
 *   is written to the order and cannot be recovered afterwards; see i18n.md.
 * @param {string|null} workId - Bound server-side for quick-buy: one painting,
 *   straight from its own page, ignoring whatever is in the cart. Null for an
 *   ordinary cart checkout.
 * @param {object} previousState
 * @param {FormData} formData
 */
export async function submitCheckout(locale, workId, previousState, formData) {
  /*
    Which paintings are being bought. Quick-buy names exactly one and never
    reads the cart; otherwise the cart is the list. Either way the ids come from
    the server's own state or a bound argument, never from the submitted form.
  */
  const workIds = workId ? [workId] : await readCartIds();

  if (workIds.length === 0) return { ok: false, error: 'empty', values: {} };

  const input = validateCheckoutInput(formData);

  if (!input.ok) {
    return { ok: false, error: 'invalid', errors: input.errors, values: input.values };
  }

  /*
    Checked before an order is written rather than after. Writing a pending order
    we then cannot take payment for would leave a row that looks abandoned and is
    actually impossible.
  */
  if (!isHypConfigured()) {
    return { ok: false, error: 'paymentNotConfigured', values: input.values };
  }

  const created = await createPendingOrder({
    workIds,
    buyer: input.buyer,
    deliveryMethod: input.deliveryMethod,
    locale,
  });

  if (!created.ok) {
    if (created.error === 'unavailable') {
      /*
        Named, not counted. "One of your paintings is no longer available" sends
        somebody back to a list of four to work out which — and a painting that
        has just sold is exactly the moment to be precise. An id that resolves to
        nothing has no title to print, so those are counted separately.
      */
      const titles = created.unavailable
        .filter((entry) => entry.title)
        .map((entry) => entry.title[locale]);

      return {
        ok: false,
        error: 'unavailable',
        unavailableTitles: titles,
        unavailableUnknownCount: created.unavailable.length - titles.length,
        values: input.values,
      };
    }

    return { ok: false, error: created.error, values: input.values };
  }

  const dictionary = await getDictionary(locale);

  const payment = await createPaymentPage({
    totalAgorot: created.order.totalAgorot,
    /* The order's id is its public reference, and what comes back on the redirect. */
    orderReference: created.order.id,
    buyer: input.buyer,
    locale,
    /*
      Shown on Hyp's page and kept in their records. Translated here, because no
      user-facing copy lives in the payments module.
    */
    info: interpolate(dictionary.checkout.paymentInfo, {
      count: created.order.lines.length,
    }),
  });

  if (!payment.ok) {
    /*
      The order stays `pending` with nothing paid against it, which is the right
      residue: it is a record that somebody tried, it is visible in the admin, and
      it can never be mistaken for a sale. The detail is already in the server log.
    */
    return {
      ok: false,
      error: 'paymentUnavailable',
      paymentError: payment.error,
      values: input.values,
    };
  }

  /*
    Outside every try/catch, and last. `redirect` works by throwing a control-flow
    signal Next catches, so swallowing it would turn a successful checkout into a
    silent no-op.
  */
  redirect(payment.url);
}
