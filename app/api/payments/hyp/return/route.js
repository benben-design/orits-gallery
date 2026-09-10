import { handlePaymentReturn } from '@/lib/payments/handle-return';

/**
 * The terminal's **success** return URL.
 *
 * Where Hyp sends the buyer's browser after a payment it believes succeeded —
 * and one of two paths that must be configured in the Hyp console, because the
 * return URLs are a terminal-level setting rather than something we send per
 * transaction. See deployment.md for both.
 *
 * **The handling lives in `lib/payments/handle-return.js`, and its twin at
 * `/error` runs exactly the same function.** Which URL the browser arrives at is
 * a hint from the provider; the fact is what VERIFY answers. A landing here that
 * fails verification changes nothing at all.
 *
 * **A route handler rather than a page**, and for a reason that has nothing to do
 * with payments: a confirmed payment clears the cart cookie, and Next permits a
 * cookie to be set only from an action or a route handler — never while
 * rendering a page. See api.md.
 */
export async function GET(request) {
  return handlePaymentReturn(request);
}
