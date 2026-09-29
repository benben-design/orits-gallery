/**
 * Where Hyp lives — and nothing else.
 *
 * **Its own module so that next.config.mjs can import it.** The config builds
 * the Content Security Policy's `form-action` from `HYP_PAYMENT_ORIGIN`, and the
 * config is loaded by plain Node, outside React's server environment — so it
 * cannot import `lib/payments/hyp.js`, which reads the terminal's credentials
 * and is marked `server-only`. This file reads no environment variable and
 * imports nothing, and must stay that way: anything added here is loaded by the
 * config on every build and every dev start.
 */

/** Hyp's single endpoint. The same host for test and production; only the credentials differ. */
export const HYP_ENDPOINT = 'https://pay.hyp.co.il/p/';

/**
 * The origin the buyer is sent to, for `form-action`. Derived rather than
 * typed, so the policy can never allow one payment host while `hyp.js` sends
 * buyers to another — without script, checkout's redirect to Hyp follows a form
 * post, and the browser holds it to `form-action`.
 */
export const HYP_PAYMENT_ORIGIN = new URL(HYP_ENDPOINT).origin;
