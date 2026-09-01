/**
 * The admin guard.
 *
 * One function, called first thing by every page under
 * `app/(admin)/admin/(guarded)/`. No session, or a session that does not
 * verify, and the request never renders: it redirects to the login page,
 * carrying where it was going so the person arrives there after signing in.
 *
 * It verifies the cookie's signature and expiry and **touches no database**.
 * That is what keeps it cheap enough to run on every admin page view.
 *
 * WHY NOT IN proxy.js
 *
 * That file's matcher excludes `/admin` deliberately — the admin sits outside
 * the locale structure and must not be redirected into it. Putting the guard
 * there would mean unpicking that exclusion for a check the pages can do
 * themselves.
 *
 * WHY NOT IN A LAYOUT
 *
 * The obvious home is `(guarded)/layout.js`, and it was measured rather than
 * assumed. Two findings decided it:
 *
 *   1. A layout is given `{ children, params }` and nothing else, and
 *      `headers()` on a document request carries no path. **A layout cannot
 *      know which page was asked for**, so it can only ever send everyone to
 *      the dashboard.
 *   2. When a layout and its page both redirect, the layout's redirect wins.
 *      So a layout guard does not coexist with a page guard that knows better —
 *      it overrides it.
 *
 * Landing back on the page you asked for is a stated requirement, so the check
 * lives where the path is known: the page. The cost is that a new page could
 * forget it, and that is not left to memory —
 * `scripts/check-admin-guard.mjs` fails `npm run lint` if any page in the
 * guarded group does not call this.
 *
 * THIS IS NOT A SECURITY BOUNDARY. It guards *rendering*. It does not run for
 * route handlers or Server Actions, so every admin mutation must verify the
 * session itself. See .claude/rules/security.md.
 *
 * It does not cover `generateMetadata` either — that is a separate export and
 * Next calls it whether or not the page component redirects, so a guarded
 * page's `<title>` is computed for a signed-out request. Harmless while every
 * admin title is a fixed dictionary string; **never build one out of record
 * data**, or the title leaks what the guard is refusing to show.
 */
import { redirect } from 'next/navigation';
import { readAdminSession } from './admin-session';

export const ADMIN_LOGIN_PATH = '/admin/login';

/** Where a sign-in goes when nothing better is known. */
export const ADMIN_HOME_PATH = '/admin';

/**
 * The query parameter carrying the originally requested page.
 *
 * Short and boring on purpose: it shows up in the address bar of a person who
 * has just been bounced to a login screen, and it should look like plumbing
 * rather than like something has gone wrong.
 */
export const RETURN_TO_PARAM = 'next';

/**
 * Narrows a return path to somewhere inside the admin, or gives up and returns
 * the dashboard.
 *
 * This value arrives from a URL, which means anyone can choose it, so it is
 * treated as hostile:
 *
 *   - It must be a path inside `/admin/`, so this cannot be turned into an
 *     open redirect that sends someone from a link on our domain to an
 *     attacker's.
 *   - `//evil.example` and `https://evil.example` are both rejected. The first
 *     is the one that catches people out: it starts with a slash and reads
 *     like a path, but a browser treats it as protocol-relative and leaves the
 *     site.
 *   - The login page itself is rejected, because sending someone who has just
 *     signed in back to the sign-in form is a loop with no exit.
 *
 * @param {unknown} value
 * @returns {string} A safe admin path.
 */
export function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length === 0) return ADMIN_HOME_PATH;

  // Protocol-relative, or an absolute URL with a scheme. Neither is ours.
  if (value.startsWith('//') || value.includes(':')) return ADMIN_HOME_PATH;
  if (!value.startsWith('/admin')) return ADMIN_HOME_PATH;

  // Backslashes because some browsers have historically normalised them to
  // forward slashes, which turns /\evil.example into //evil.example.
  if (value.includes('\\')) return ADMIN_HOME_PATH;

  const [path] = value.split('?');

  // A traversal segment climbs back out: /admin/../he starts with /admin and
  // passes every check above, and then the browser resolves it to /he. Caught
  // here rather than by normalising, because normalising and then trusting the
  // result is the version of this that gets subtly wrong later.
  if (path.split('/').includes('..')) return ADMIN_HOME_PATH;

  if (path === ADMIN_LOGIN_PATH) return ADMIN_HOME_PATH;

  // Guard against /adminsomething, which starts with /admin but is not inside
  // it. Exactly /admin is fine.
  if (path !== ADMIN_HOME_PATH && !path.startsWith('/admin/')) {
    return ADMIN_HOME_PATH;
  }

  return value;
}

/**
 * Requires a signed-in admin, or redirects to the login page.
 *
 * Call it as the first statement of a guarded page, before any data is read
 * and before anything is rendered.
 *
 * @param {string} [returnTo] - The page being guarded, so sign-in can come
 *   back to it. Pass the path this page lives at.
 * @returns {Promise<{sub: string, exp: number}>} The verified session.
 */
export async function requireAdminSession(returnTo = ADMIN_HOME_PATH) {
  const session = await readAdminSession();

  if (session) return session;

  const destination = safeReturnTo(returnTo);

  // redirect() works by throwing, so nothing after it runs and nothing this
  // page would have rendered is ever produced.
  redirect(
    destination === ADMIN_HOME_PATH
      ? ADMIN_LOGIN_PATH
      : ADMIN_LOGIN_PATH +
          '?' +
          RETURN_TO_PARAM +
          '=' +
          encodeURIComponent(destination)
  );
}
