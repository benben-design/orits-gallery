/**
 * What a cart *is*, as a value: an ordered list of work ids, and what they add
 * up to.
 *
 * The pure half, deliberately split from `cart-cookie.js` the same way
 * `lib/auth/session.js` is split from `lib/auth/admin-session.js` — nothing
 * here touches `next/headers`, a request or a database, so the rules can be
 * exercised by plain Node and read without holding a request in your head.
 *
 * **A cart holds ids and nothing else.** Not titles, not prices, not
 * availability. That is not economy, it is the rule from commerce.md: a cart
 * is a wish, not a hold. Every fact about a painting is re-read from the
 * database on every render of the cart page, so a work that sold while it sat
 * here is caught rather than remembered wrongly. Storing a price in the cookie
 * would be storing a number the buyer could edit, about a painting that may no
 * longer be for sale.
 *
 * **There is no quantity, here or anywhere.** Every painting is a one-off, so
 * an id appears at most once and adding it twice is the same cart. See
 * commerce.md — adding a quantity would be a bug, not a feature.
 */

/**
 * The cookie's name.
 *
 * It lives in the pure module rather than beside the cookie's *attributes* in
 * `cart-cookie.js` for one reason: the header's item count reads the cookie in
 * the browser, and `cart-cookie.js` imports `next/headers`, which a client
 * component cannot. The name is the one thing both sides must agree on, so it
 * belongs where both sides can reach it. Everything about *how* the cookie is
 * written stays server-side.
 */
export const CART_COOKIE_NAME = 'cart';

/**
 * How many paintings a cart may hold.
 *
 * A cap rather than an unbounded list, for a mundane reason: this lives in a
 * cookie, which is sent on every request and dies somewhere around 4KB. A uuid
 * and its separator are 37 bytes, so a hundred works would be 3.7KB of header
 * on every request. Twenty is far past what anyone buys in one visit and
 * nowhere near the limit.
 *
 * With sixteen works in the catalogue this cannot currently be reached. It is
 * here so that it never becomes reachable by accident.
 */
export const MAX_CART_ITEMS = 20;

/**
 * The separator between ids in the cookie value.
 *
 * A dot, because a uuid contains hex digits and hyphens and never one of
 * these — so the value can be split without escaping anything, and a mangled
 * cookie produces ids that fail the shape check below rather than a
 * half-parsed one.
 */
const SEPARATOR = '.';

/** The canonical uuid shape. Anything else in the cookie is not one of ours. */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ids in a raw cookie value, in the order they were added.
 *
 * **Everything that is not obviously one of our ids is dropped**, silently and
 * without an error. The value came from a browser, so it may have been edited
 * by hand, truncated by a proxy, or left over from an older format — and none
 * of those is a reason to fail a page. Dropping is safe because an id is all
 * this carries: the worst a hand-edited cookie can do is name a painting the
 * visitor could have opened anyway, or a uuid that resolves to nothing.
 *
 * Duplicates collapse, because there is no quantity.
 *
 * @param {string|undefined|null} value
 * @returns {string[]}
 */
export function parseCart(value) {
  if (typeof value !== 'string' || value === '') return [];

  const seen = new Set();

  for (const candidate of value.split(SEPARATOR)) {
    if (!ID_PATTERN.test(candidate)) continue;

    // Lowercased so that two spellings of one uuid cannot both be held.
    seen.add(candidate.toLowerCase());

    if (seen.size >= MAX_CART_ITEMS) break;
  }

  return [...seen];
}

/**
 * The cookie value for a list of ids. The inverse of parseCart.
 *
 * @param {string[]} ids
 * @returns {string}
 */
export function serialiseCart(ids) {
  return ids.join(SEPARATOR);
}

/**
 * One cookie's value out of a `document.cookie` string.
 *
 * Twenty lines rather than a cookie package, which is the house style — and it
 * is pure, so the parsing can be exercised without a browser. The header's
 * count is its only caller; every server-side read goes through
 * `next/headers`, which has already done this.
 *
 * @param {string} cookieString - `document.cookie`.
 * @param {string} name
 * @returns {string|null} null when the cookie is absent.
 */
export function readCookieValue(cookieString, name) {
  if (typeof cookieString !== 'string') return null;

  for (const pair of cookieString.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;

    if (pair.slice(0, separator).trim() !== name) continue;

    /*
      A value the browser hands back can be percent-encoded, and a malformed
      escape makes decodeURIComponent throw — which must not take the header
      down over a numeral. An undecodable value is treated as absent.
    */
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * The cart with one more painting in it.
 *
 * Idempotent, and it has to be: a painting is a single object, so adding one
 * that is already there is not a second copy — it is the same wish expressed
 * twice, and the honest answer is the cart unchanged. A cart at the cap is
 * also returned unchanged; the page says so rather than dropping the oldest
 * item, because silently forgetting something someone chose is worse than
 * refusing to add.
 *
 * @param {string[]} ids
 * @param {string} id
 * @returns {string[]}
 */
export function addToCart(ids, id) {
  if (!ID_PATTERN.test(id)) return ids;
  if (ids.includes(id)) return ids;
  if (ids.length >= MAX_CART_ITEMS) return ids;

  return [...ids, id];
}

/**
 * The cart without one painting.
 *
 * @param {string[]} ids
 * @param {string} id
 * @returns {string[]}
 */
export function removeFromCart(ids, id) {
  return ids.filter((held) => held !== id);
}

/**
 * The cart holding only the ids given — used to drop the ones that no longer
 * resolve to anything a visitor may see.
 *
 * The cart's own order is preserved rather than the order of `keep`, so
 * removing a vanished painting does not reshuffle the rest.
 *
 * @param {string[]} ids
 * @param {Iterable<string>} keep
 * @returns {string[]}
 */
export function keepOnly(ids, keep) {
  const keeping = new Set(keep);
  return ids.filter((held) => keeping.has(held));
}

/**
 * What one painting would actually be charged at.
 *
 * A reduced price is **a price, never a status** — commerce.md — so a
 * discounted work is still `available` and what it costs is simply the lower
 * number. This is the one place that resolves the pair, so a total and a line
 * cannot disagree about which of the two applies.
 *
 * Note that the *public presentation* of a discount is still undecided, and
 * this does not decide it: `components/ui/Price.js` renders `amount` and says
 * nothing about a reduction. That is a real inconsistency waiting for a design
 * decision — see commerce.md — and it is dormant, because no work carries a
 * reduced price today.
 *
 * @param {object} work - A work as the repository returns it.
 * @returns {number} Whole currency units.
 */
export function chargeableAmount(work) {
  const { amount, reducedAmount } = work.price;
  return typeof reducedAmount === 'number' ? reducedAmount : amount;
}

/**
 * What a list of works adds up to, or null when the list is empty.
 *
 * **This is a display total and nothing else.** It is not what anybody is
 * charged: api.md requires the server to compute what is charged from its own
 * records at the moment of payment, in minor units, and checkout will do
 * exactly that. Adding up numbers a page is already showing is a different job
 * from settling a transaction, and conflating the two is how a float lands in
 * a charge.
 *
 * The arithmetic is in whole shekels because that is the unit the repository
 * hands out, and it is rounded to the agora to keep binary-float dust out of a
 * figure people read. `formatPrice` renders no fraction digits anyway, so the
 * rounding is belt to that brace.
 *
 * @param {object[]} works
 * @returns {{amount: number, currency: string}|null}
 */
export function cartTotal(works) {
  if (works.length === 0) return null;

  const amount = works.reduce((sum, work) => sum + chargeableAmount(work), 0);

  return {
    amount: Math.round(amount * 100) / 100,
    /*
      Every work is priced in the same currency — the column defaults to ILS
      and the admin has no field to change it — so the first line names it for
      the total. If a second currency ever becomes possible, one total stops
      being a meaningful figure and this has to become a decision rather than a
      default.
    */
    currency: works[0].price.currency,
  };
}
