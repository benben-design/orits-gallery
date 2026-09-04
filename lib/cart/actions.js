'use server';

/**
 * The four things the cart can be asked to do: read itself, take a painting in,
 * let one go, and sweep up the ones that no longer exist.
 *
 * These are **Server Actions**, not a route handler, and api.md is explicit
 * about why: a route exists for what a third party must be able to call. This
 * is the case that file names as the alternative — "a client component can call
 * a Server Action directly and await what it returns", which is exactly what
 * the drawer does. No URL, POST only, nothing to guard against being called by
 * anyone but the page.
 *
 * **They return the cart rather than redirecting.** That is a change from the
 * first version, which redirected to `/cart` and carried a code in the query
 * string. The drawer opens in place and never navigates, so it needs the new
 * contents back; and the `/cart` page still works unchanged, because a form
 * whose action returns a value still re-renders the route it posted from — and
 * that page reads the cookie on every render anyway.
 *
 * **Nothing here trusts the cart cookie.** It carries ids; every fact about a
 * painting is re-read from the database inside these functions and again each
 * time the cart is rendered. That is commerce.md's rule that a cart is a wish
 * and never a hold: a work sold on another platform an hour ago cannot be
 * added, however long its id has been sitting in a browser.
 *
 * There is no session check, and that is not an omission — these are public.
 * The rule in security.md is about admin mutations; the only thing an
 * unauthenticated caller can change here is their own cookie.
 */
import { readCartIds, writeCartIds } from './cart-cookie';
import { addToCart, removeFromCart, keepOnly, cartTotal, MAX_CART_ITEMS } from './cart-contents';
import { getWorksByIds } from '@/lib/data/works-repository';
import { isBuyable } from '@/components/ui/statusPresentation';

/**
 * What every one of these hands back: the cart, as the drawer needs to draw it.
 *
 * **Plain serializable objects only** — this crosses to the browser. Works come
 * from the repository, which already guarantees that; nothing here reshapes
 * them, so the drawer reads `work.title[locale]` exactly as a server component
 * would and no locale logic lives in an action.
 *
 * `missingCount` is the third kind of line and the one that cannot be drawn: an
 * id that resolves to nothing, because the painting was deleted or taken off
 * the site. There is no title to print, so it is counted.
 *
 * @returns {Promise<{works: object[], total: {amount: number, currency: string}|null, missingCount: number, count: number}>}
 */
async function readCart() {
  const ids = await readCartIds();
  const works = await getWorksByIds(ids);

  /*
    Back into the order they were added. The repository orders by date, which is
    a fact about the catalogue; the order of a cart is a fact about the visit.
  */
  const byId = new Map(works.map((work) => [work.id, work]));
  const held = ids.map((id) => byId.get(id)).filter(Boolean);

  return {
    works: held,
    /* Only what can actually be bought counts towards the total. */
    total: cartTotal(held.filter((work) => isBuyable(work.status))),
    missingCount: ids.length - held.length,
    count: ids.length,
  };
}

/**
 * The cart as it stands. What the drawer calls when it opens.
 *
 * A read, so it changes nothing and is safe to call as often as the drawer is
 * opened. The header's count does **not** come through here — it reads the
 * cookie in the browser, so it is right immediately and costs no round trip.
 * This is for the contents, which only the server knows.
 */
export async function readCartContents() {
  return readCart();
}

/**
 * Puts one painting in the cart and returns the cart.
 *
 * **The availability check here is not the one that matters**, and it is worth
 * being clear about that. It stops a visitor adding a work that sold while the
 * page sat open, which is a courtesy. The check that protects the money is the
 * one checkout will run at the moment of payment — see api.md. This one runs
 * again every time the cart is drawn in between.
 *
 * `notice` is a **code**, never a sentence: the Hebrew lives in the locale
 * files and the component picks the wording. A code the drawer has no sentence
 * for renders nothing.
 *
 * @param {string} workId
 */
export async function addWorkToCart(workId) {
  const ids = await readCartIds();

  // Already held. Adding a painting twice is the same cart — there is no
  // quantity — so this is a no-op that still opens the drawer on what is there.
  if (ids.includes(workId)) return { ...(await readCart()), notice: null };

  if (ids.length >= MAX_CART_ITEMS) return { ...(await readCart()), notice: 'full' };

  /*
    Public-scoped, so an unpublished work resolves to nothing here exactly as it
    does everywhere else a visitor can reach. The status check is separate
    because publication and sale status are separate axes: a published work can
    be sold, and a draft can be available. See commerce.md.
  */
  const [work] = await getWorksByIds([workId]);
  if (!work || !isBuyable(work.status)) {
    return { ...(await readCart()), notice: 'unavailable' };
  }

  await writeCartIds(addToCart(ids, workId));
  return { ...(await readCart()), notice: null };
}

/**
 * Takes one painting out of the cart.
 *
 * No verification: removing something is safe whatever the id turns out to
 * mean, and an id that was never in the cart leaves it unchanged.
 *
 * @param {string} workId
 */
export async function removeWorkFromCart(workId) {
  const ids = await readCartIds();
  await writeCartIds(removeFromCart(ids, workId));

  return { ...(await readCart()), notice: null };
}

/**
 * Drops every id that no longer resolves to a painting a visitor may see.
 *
 * These are the works the cart cannot draw a line for — deleted, or taken off
 * the site — so there is no title to put on a button and no per-line remove to
 * offer. One control clears all of them.
 *
 * It takes no ids from the caller. The cart is re-read and re-queried here, so
 * what gets removed is decided by the database at the moment the button is
 * pressed rather than by a list the browser was handed a minute ago.
 *
 * A work that is merely **sold or reserved still resolves**, so it survives
 * this and keeps its own line. That is deliberate: seeing that the painting you
 * wanted has gone is the point, and sweeping it away silently would be the site
 * quietly deciding you had not meant it.
 */
export async function removeMissingFromCart() {
  const ids = await readCartIds();
  const works = await getWorksByIds(ids);

  await writeCartIds(keepOnly(ids, works.map((work) => work.id)));

  return { ...(await readCart()), notice: null };
}
