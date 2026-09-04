/**
 * The cart cookie: reading it and writing it.
 *
 * The request-facing half of `lib/cart/cart-contents.js`, split for the same
 * reason `lib/auth/admin-session.js` is split from `lib/auth/session.js` —
 * `next/headers` only works inside a request, and deciding what a cart contains
 * does not need one.
 *
 * **Why a cookie rather than a database row.** A cart is a wish, not a hold
 * (commerce.md), so nothing about it needs to survive the browser that made it,
 * be readable by the artist, or be reconciled with anything. A `carts` table
 * would be a second thing to write, expire and clean up in exchange for
 * nothing. The moment a cart becomes an order it stops being a cart, and
 * `orders` is where it lands.
 *
 * **Why it may be written only from a Server Action.** Next allows `cookies()`
 * to be *set* in an action or a route handler and not while rendering a page,
 * which is a constraint worth agreeing with rather than working around: it
 * means every change to a cart is a POST that a person made, and a page render
 * can never quietly mutate one. It is also why the cart page cannot tidy away
 * a painting that has vanished — it offers a button instead. See the page.
 */
import { cookies } from 'next/headers';
import { parseCart, serialiseCart, CART_COOKIE_NAME } from './cart-contents';

/**
 * The whole site, because the cart is read in the header on every page.
 *
 * Deliberately unlike the admin session, which is scoped to `/admin` precisely
 * so it is *not* sent with public pages and images. This one has to be.
 */
export const CART_COOKIE_PATH = '/';

/**
 * Thirty days.
 *
 * Long enough that someone can think about a painting over a few weeks —
 * which, at these prices, is the normal amount of thinking — and short enough
 * that a cart abandoned last winter is not still holding works whose status
 * has since changed twice. Nothing depends on the length: every fact is
 * re-read on every render, so an old cart is stale in no way that matters.
 */
export const CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * The cookie's attributes, in one place so that setting and clearing cannot
 * disagree about them — the same arrangement as the admin session's.
 *
 * - **Not `httpOnly`, deliberately.** The header's item count reads this in the
 *   browser. That is safe in a way an httpOnly cookie protects against nothing
 *   here: this cookie authorises nothing, names nobody, and carries no price.
 *   The worst a hand-edited one can do is put a painting in your own cart. What
 *   would be dangerous is trusting it, and nothing does — the cart page
 *   re-reads every work from the database, and `api.md` requires checkout to
 *   compute what is charged from the server's own records.
 *
 *   The alternative was an httpOnly cookie read in the layout, which would opt
 *   **every public page** out of static rendering to draw a small numeral. That
 *   is a bad trade on a site whose artwork pages are pre-generated.
 *
 * - **`sameSite: lax`** — not sent on a cross-site POST, so another site cannot
 *   post to the cart actions in a visitor's name. Lax rather than strict so
 *   that arriving from a WhatsApp link still shows the cart they had.
 * - **`secure` outside development**, as everywhere else here.
 */
function cookieAttributes() {
  return {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: CART_COOKIE_PATH,
  };
}

/**
 * The work ids currently in the cart, in the order they were added.
 *
 * Safe to call while rendering. Everything unrecognisable in the cookie is
 * dropped by `parseCart` rather than raising — see the reasoning there.
 *
 * @returns {Promise<string[]>}
 */
export async function readCartIds() {
  const cookieStore = await cookies();
  return parseCart(cookieStore.get(CART_COOKIE_NAME)?.value);
}

/**
 * Replaces the cart. **Only callable from a Server Action or route handler.**
 *
 * An empty cart deletes the cookie rather than storing an empty string, so
 * someone who removes their last painting stops carrying a header on every
 * request for a cart that holds nothing.
 *
 * @param {string[]} ids
 */
export async function writeCartIds(ids) {
  const cookieStore = await cookies();

  if (ids.length === 0) {
    cookieStore.delete({ name: CART_COOKIE_NAME, path: CART_COOKIE_PATH });
    return;
  }

  cookieStore.set(CART_COOKIE_NAME, serialiseCart(ids), {
    ...cookieAttributes(),
    maxAge: CART_MAX_AGE_SECONDS,
  });
}
