/**
 * Where a request came from, as far as anything can tell.
 *
 * Used only for rate limiting. **Never use it for authorisation**: every value
 * read here comes from a header, and a header is written by whoever is on the
 * other end unless something in front of us rewrites it.
 *
 * WHAT IS KNOWN, AND WHAT IS NOT (28-09-2026)
 *
 * The order this reads in:
 *
 *   1. `x-nf-client-connection-ip` — **Netlify's own** client-address header,
 *      named for the connection its edge accepted rather than for anything the
 *      client said. On Netlify this is the one to believe, and it is preferred
 *      for that reason.
 *   2. `x-forwarded-for`, left-most entry — the fallback, for running anywhere
 *      that header is absent: a laptop, or a host that is not Netlify.
 *   3. `x-real-ip`, for a proxy that sets only that.
 *
 * **None of this has been measured on Netlify yet.** In particular, it is not
 * known whether Netlify's edge replaces a client's own `x-forwarded-for` or
 * appends to it, nor whether it strips a `x-nf-client-connection-ip` a client
 * sent itself. An earlier version of this comment asserted the first as fact
 * and read the left-most `x-forwarded-for` because of it; that was never
 * checked. `/admin/api/client-ip` exists, temporarily, to check both on the
 * deployed site. Until it has, treat every value here as possibly chosen by
 * the caller.
 *
 * WHAT A FORGED VALUE BUYS, AND WHAT STOPS IT
 *
 * A caller who can choose the source gets a fresh **pair** counter and a fresh
 * **source** counter on every attempt — both are keyed on the source, so both
 * start from zero each time. An earlier version of this comment said the
 * per-address side "still counts" when the source is spoofed; nothing did, since
 * the tight counter is keyed on (address, source) and every rotated source is a
 * new pair. **The per-address counter from migration 012 is what counts now**:
 * 20 failures on one address within an hour, from any mix of sources, block
 * that address everywhere. See lib/auth/login-throttle.js.
 *
 * A request with no usable header gets a constant bucket rather than being
 * waved through. Everything unattributable then shares one counter, which is
 * the safe direction to fail: the alternative is an attacker stripping the
 * header to opt out of rate limiting entirely.
 */
import { headers } from 'next/headers';

/** What unattributable requests are counted against, together. */
export const UNKNOWN_CLIENT_IP = 'unknown';

/**
 * The longest address string we will store. IPv6 with an embedded IPv4 and a
 * zone index is comfortably under this; anything longer is not an address and
 * is truncated rather than trusted at length, so a header cannot be used to
 * push megabytes into the table.
 */
const MAX_LENGTH = 64;

/**
 * @returns {Promise<string>} The client address, or UNKNOWN_CLIENT_IP.
 */
export async function readClientIp() {
  const headerList = await headers();

  const candidate =
    headerList.get('x-nf-client-connection-ip') ??
    // "client, proxy1, proxy2" — the left-most is what the first proxy was
    // told, which is only the peer if that proxy replaced the client's value.
    headerList.get('x-forwarded-for')?.split(',')[0] ??
    headerList.get('x-real-ip') ??
    '';

  const first = candidate.trim();

  if (!first) return UNKNOWN_CLIENT_IP;

  // IPv6-mapped IPv4 arrives as ::ffff:127.0.0.1 locally. Normalised so the
  // same machine does not accumulate two separate counters depending on which
  // form the stack happened to produce.
  const normalized = first.startsWith('::ffff:') ? first.slice(7) : first;

  return normalized.slice(0, MAX_LENGTH);
}
