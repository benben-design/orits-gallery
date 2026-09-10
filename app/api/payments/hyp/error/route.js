import { handlePaymentReturn } from '@/lib/payments/handle-return';

/**
 * The terminal's **error** return URL — a declined card, or a buyer who backed
 * out of the payment page.
 *
 * **It runs the same handler as the success return, and that is deliberate.**
 * Landing here is Hyp's opinion; `CCode` from VERIFY is the fact. In the ordinary
 * case verification declines too, nothing changes, and the buyer is told the
 * payment is not confirmed with their cart still intact.
 *
 * But if a landing *here* somehow verifies as a genuine payment, it is settled
 * exactly as it would be on the other route. The alternative is keeping a
 * buyer's money for a painting nobody ever marked sold, on the strength of which
 * redirect path the browser happened to take — and between trusting the provider's
 * routing and trusting the provider's answer, the answer wins every time.
 */
export async function GET(request) {
  return handlePaymentReturn(request);
}
