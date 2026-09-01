/**
 * Where a request came from, as far as anything can tell.
 *
 * Used only for rate limiting. **Never use it for authorisation**: the value
 * ultimately comes from a header, and a header is written by whoever is on the
 * other end unless something in front rewrites it.
 *
 * WHAT CAN AND CANNOT BE TRUSTED HERE
 *
 * On Vercel, `x-forwarded-for` is set by the platform's proxy and the client's
 * own value is replaced rather than appended to, so the left-most entry is the
 * real peer. That is the deployment this site has, and it is why the left-most
 * entry is what this reads.
 *
 * Running behind anything else — or directly, with no proxy — that guarantee is
 * gone and a determined caller can put whatever it likes in the header, giving
 * itself a fresh counter per attempt. That does not make the throttle useless:
 * the tight limit is keyed on the address *and* the source, so spoofing the
 * source still leaves the per-address side of it counting. But it is the reason
 * this file exists as one place with one comment rather than a header read
 * inline at the call site.
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

  // x-forwarded-for first, then x-real-ip as a fallback for proxies that set
  // only that. Both are read the same way and neither is more trustworthy.
  const forwarded = headerList.get('x-forwarded-for');
  const candidate = forwarded ?? headerList.get('x-real-ip') ?? '';

  // "client, proxy1, proxy2" — the left-most is the peer Vercel saw.
  const first = candidate.split(',')[0].trim();

  if (!first) return UNKNOWN_CLIENT_IP;

  // IPv6-mapped IPv4 arrives as ::ffff:127.0.0.1 locally. Normalised so the
  // same machine does not accumulate two separate counters depending on which
  // form the stack happened to produce.
  const normalized = first.startsWith('::ffff:') ? first.slice(7) : first;

  return normalized.slice(0, MAX_LENGTH);
}
