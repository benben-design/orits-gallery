/**
 * The admin session cookie: reading it, setting it, clearing it.
 *
 * The request-facing half of `lib/auth/session.js`, kept separate because
 * `next/headers` only works inside a request and the signing itself does not
 * need one.
 *
 * Server-side only. Importing this into a client component would be a build
 * error, and would be trying to read an httpOnly cookie from a place that
 * cannot see it — which is the entire point of httpOnly.
 */
import { cookies } from 'next/headers';
import {
  signSession,
  verifySession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  SESSION_MAX_AGE_SECONDS,
} from './session';

/**
 * The cookie's attributes, in one place so that setting and clearing cannot
 * disagree about them.
 *
 * - **httpOnly** — JavaScript in the page cannot read it, so a script injected
 *   into an admin page cannot walk off with the session.
 * - **sameSite: lax** — not sent on cross-site POSTs, which is what stops
 *   another site submitting a form to an admin route in the artist's name.
 *   Lax rather than strict so that following a link into the admin from
 *   somewhere else still arrives signed in.
 * - **secure outside development** — the cookie is refused over plain HTTP, so
 *   it cannot leak on a shared network. Off in development because localhost
 *   is http. Note the consequence: `npm run start` sets NODE_ENV=production, so
 *   a production build browsed over http://localhost will not keep this cookie.
 *   That is correct behaviour, not a bug to work around.
 * - **path** — see SESSION_COOKIE_PATH; it is scoped to the admin area.
 */
function cookieAttributes() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: SESSION_COOKIE_PATH,
  };
}

/**
 * Signs the given account in, by setting the session cookie.
 *
 * @param {string} adminUserId - The `admin_users.id` to name in the session.
 */
export async function startAdminSession(adminUserId) {
  const { value } = signSession(adminUserId);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, value, {
    ...cookieAttributes(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Signs out, by removing the cookie.
 *
 * The path has to match the one it was set with, or the browser deletes
 * nothing and the person stays signed in with no way to tell.
 *
 * This clears the cookie in this browser. It does not and cannot invalidate a
 * copy of the value taken from it beforehand — see the trade recorded in
 * `lib/auth/session.js`.
 */
export async function endAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete({ name: SESSION_COOKIE_NAME, path: SESSION_COOKIE_PATH });
}

/**
 * The current session, or null when there is not one.
 *
 * Every failure — no cookie, a tampered value, an expired one, one signed with
 * a secret that has since been rotated — is the same answer: nobody is signed
 * in. Reading this is cheap; it is an HMAC over a short string and no database
 * call.
 *
 * @returns {Promise<{sub: string, exp: number}|null>}
 */
export async function readAdminSession() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!cookie?.value) return null;

  return verifySession(cookie.value);
}

/**
 * Whether anyone is signed in. The admin shell asks this to decide whether to
 * render navigation at all.
 *
 * @returns {Promise<boolean>}
 */
export async function isSignedIn() {
  return (await readAdminSession()) !== null;
}
