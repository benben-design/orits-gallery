/**
 * Where a request came from, as far as anything can tell.
 *
 * Used only for rate limiting — the admin sign-in throttle and the checkout
 * throttle. **Never use it for authorisation**: every value read here arrives
 * in a header.
 *
 * WHAT NETLIFY DOES, MEASURED ON 29-09-2026
 *
 * On the live deploy, signed in, with each header forged by the client:
 *
 *   - `x-nf-client-connection-ip` — **overwritten** by Netlify's edge with the
 *     real address. A forged value never arrives. This is the one to believe,
 *     and in production the only one read.
 *   - `x-forwarded-for` — a client's own value is **kept**, and Netlify appends
 *     after it. The measured value was `"147.235.217.51, 63.178.53.27"`: the
 *     left-most entry is whatever the client wrote, and the right-most is
 *     Netlify's own edge address, the same for every visitor. **Neither end
 *     identifies the client**, so production does not read this header at all.
 *   - `x-real-ip` — passed through **exactly as the client sent it**. Nothing
 *     reads it, and nothing may: it is a header the caller writes.
 *   - `client-ip` — absent.
 *
 * WHAT THIS READS
 *
 * In production, `x-nf-client-connection-ip` and nothing else. If it is
 * missing — not on Netlify, or Netlify ever stops setting it — the request
 * falls into the shared unknown bucket rather than trusting a header the
 * caller controls.
 *
 * **In development only**, the left-most `x-forwarded-for` is read as a
 * fallback, so a test can simulate different sources against a local server.
 * `NODE_ENV` is `production` on the live site and on Netlify deploy previews
 * alike, so no deployed build reads it.
 *
 * WHAT A FORGED VALUE BUYS
 *
 * On Netlify, nothing: the header this reads is Netlify's. A caller who varies
 * the source for real — many machines — gets a fresh sign-in pair and source
 * counter each time, which is why migration 012's per-address counter exists;
 * see lib/auth/login-throttle.js.
 *
 * A request with no usable header gets a constant bucket rather than being
 * waved through. Everything unattributable then shares one counter, which is
 * the safe direction to fail: the alternative is stripping a header to opt out
 * of rate limiting entirely.
 */
import { headers } from 'next/headers';

/** What unattributable requests are counted against, together. */
export const UNKNOWN_CLIENT_IP = 'unknown';

/**
 * The longest address string we will store. IPv6 with an embedded IPv4 and a
 * zone index is comfortably under this; anything longer is not an address and
 * is truncated rather than trusted at length, so a header cannot be used to
 * push megabytes into a table.
 */
const MAX_LENGTH = 64;

/**
 * @returns {Promise<string>} The client address, or UNKNOWN_CLIENT_IP.
 */
export async function readClientIp() {
  const headerList = await headers();

  let candidate = headerList.get('x-nf-client-connection-ip') ?? '';

  // Development only: the left-most entry, which is whatever the caller wrote.
  // That is what makes it useful to a test and worthless in production.
  if (!candidate.trim() && process.env.NODE_ENV !== 'production') {
    candidate = headerList.get('x-forwarded-for')?.split(',')[0] ?? '';
  }

  const first = candidate.trim();

  if (!first) return UNKNOWN_CLIENT_IP;

  // IPv6-mapped IPv4 arrives as ::ffff:127.0.0.1 locally. Normalised so the
  // same machine does not accumulate two separate counters depending on which
  // form the stack happened to produce.
  const normalized = first.startsWith('::ffff:') ? first.slice(7) : first;

  return normalized.slice(0, MAX_LENGTH);
}
