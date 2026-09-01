/**
 * The admin session token: signing and verification.
 *
 * Pure functions over strings. Nothing here touches cookies, the request, or
 * the database — `lib/auth/admin-session.js` does that — so this module can be
 * reasoned about and tested on its own.
 *
 * THE SHAPE
 *
 *   base64url({"sub":"<uuid>","exp":<unix seconds>}).base64url(HMAC-SHA256)
 *
 * The payload is signed, not encrypted. Anyone holding the cookie can read
 * which account it names and when it expires; nobody can change either without
 * the secret. That is the property that matters, and it is why the payload
 * carries nothing that would be damaging to read.
 *
 * THE TRADE, AND IT IS DELIBERATE
 *
 * There is no session table. The cookie is the whole session, so:
 *
 *   - **An individual session cannot be revoked.** Signing out clears the
 *     cookie in that browser, but a copy of the value taken beforehand stays
 *     valid until it expires. Nothing server-side is tracking it.
 *   - **Rotating ADMIN_SESSION_SECRET invalidates every session at once**, for
 *     both accounts, immediately. That is the only revocation mechanism there
 *     is, and it is a blunt one.
 *
 * That was accepted knowingly for two accounts and a fourteen-day expiry, and
 * it is written here so it is not later "fixed" by someone who assumes a
 * session table was forgotten. Adding one is a real decision with real cost —
 * a database read on every admin request — not a missing piece. See
 * .claude/rules/security.md.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** The cookie's name. */
export const SESSION_COOKIE_NAME = 'orit_admin_session';

/**
 * Scoped to the admin area rather than the whole site, so the cookie is simply
 * not sent with requests for public pages, painting images or the API.
 *
 * The consequence is worth knowing before it bites: **an admin endpoint placed
 * outside `/admin` will not receive this cookie**, and will look unauthenticated
 * no matter how correct its guard is. Admin mutations therefore live under
 * `/admin`. Server Actions post back to the page that rendered the form, which
 * is already under this path, so they are fine.
 */
export const SESSION_COOKIE_PATH = '/admin';

/**
 * Fourteen days, absolute.
 *
 * There is no sliding refresh: the clock starts when you sign in and is not
 * extended by using the site. Two weeks after signing in, everyone signs in
 * again. A sliding window would mean a stolen cookie in regular use never
 * expires at all, which is the failure this avoids.
 */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

/**
 * The shortest secret worth having. A 32-character secret is not a strong one
 * by any measure, but below that the HMAC is guessable and the whole scheme is
 * decoration.
 */
const MIN_SECRET_LENGTH = 32;

/**
 * Reads the signing secret, or explains what is missing.
 *
 * Deliberately loud, and deliberately read per call rather than captured at
 * import time: a module-level read would throw while building pages that never
 * touch a session, and would also freeze a rotated secret into a warm process.
 */
function readSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      'ADMIN_SESSION_SECRET is not set, so an admin session cannot be signed.\n' +
        'Add it to .env.local (it is already listed in .env.example) and to the\n' +
        'Vercel project. Generate one with:\n' +
        '  node -e "console.log(require(\'node:crypto\').randomBytes(48).toString(\'base64url\'))"\n' +
        'Restart the dev server afterwards — Next reads .env.local at startup.'
    );
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      'ADMIN_SESSION_SECRET is only ' +
        secret.length +
        ' characters. It must be at least ' +
        MIN_SECRET_LENGTH +
        ', or the signature it produces is guessable.'
    );
  }

  return secret;
}

/* ------------------------------------------------------------------ *
 * Encoding
 *
 * base64url rather than base64: a cookie value may not contain the padding or
 * the + and / that plain base64 produces.
 * ------------------------------------------------------------------ */

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload) {
  return createHmac('sha256', readSecret()).update(payload).digest('base64url');
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Builds a signed session value for one account.
 *
 * @param {string} adminUserId - The `admin_users.id` this session names.
 * @param {number} [now] - Unix milliseconds; injectable so expiry is testable.
 * @returns {{value: string, expiresAt: Date}}
 */
export function signSession(adminUserId, now = Date.now()) {
  if (!adminUserId) {
    throw new Error('A session must name an account.');
  }

  const expiresAtSeconds =
    Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;

  const payload = encode(
    JSON.stringify({ sub: adminUserId, exp: expiresAtSeconds })
  );

  return {
    value: payload + '.' + sign(payload),
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
}

/**
 * Verifies a session value and returns what it says, or null.
 *
 * Order matters and is not interchangeable: **the signature is checked before
 * anything in the payload is believed.** Reading the expiry out of an
 * unverified payload would mean trusting a number the holder can choose.
 *
 * Returns null for every failure — malformed, wrong signature, expired, signed
 * with a different secret. The caller wants "is there a session here", and
 * there either is or there is not.
 *
 * @param {string} token
 * @param {number} [now] - Unix milliseconds.
 * @returns {{sub: string, exp: number}|null}
 */
export function verifySession(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length === 0) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  let expected;
  try {
    expected = sign(payload);
  } catch {
    // No secret, or one too short to use. Nothing verifies.
    return null;
  }

  // Constant time, for the same reason the password comparison is: a byte-wise
  // early exit tells a forger how much of a candidate signature was right.
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length) return null;
  if (!timingSafeEqual(given, wanted)) return null;

  let claims;
  try {
    claims = JSON.parse(decode(payload));
  } catch {
    return null;
  }

  if (!claims || typeof claims.sub !== 'string' || !claims.sub) return null;
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return null;

  // The cookie carries its own expiry too, but that one is a courtesy the
  // browser performs. This is the one that is enforced.
  if (claims.exp * 1000 <= now) return null;

  return { sub: claims.sub, exp: claims.exp };
}
