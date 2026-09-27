/**
 * Which public routes the sitemap offers, and which it deliberately does not.
 *
 * **Why this is a module and not a list inside `app/sitemap.js`.** The sitemap
 * used to name every route in the locked map, including six that are still
 * stubs — so the first deployment would have invited Google to index six
 * placeholder pages, and thin content indexed early is expensive to undo.
 *
 * Deleting those six would have fixed today and not tomorrow: the next page
 * built is a page somebody has to *remember* to add, and the one after that is
 * a stub somebody has to remember to remove. So the lists live here, where
 * `scripts/check-sitemap.mjs` can read them with no bundler and no dependency,
 * and cross-check them against what is actually on disk.
 *
 * **The invariant that script enforces**, which is the real answer to how a
 * path joins the sitemap:
 *
 *   > Every `page.js` under `app/(site)/[locale]/` is exactly one of three
 *   > things — a stub, a deliberate exclusion, or listed here.
 *
 * That closes both directions. A stub cannot be listed, because a page that
 * renders `StubPage` and appears in `INDEXABLE_PATHS` fails the check. And a
 * page that is finished cannot be quietly left out, because a built page that
 * is in none of the three lists fails it too. Nobody has to remember either
 * half; they have to answer the check.
 *
 * **This file must stay importable by plain Node**, not only through Next's
 * bundler — the guard script imports it directly. So: no `@/` aliases, no JSON
 * imports, no framework. Two arrays of strings and the reasoning behind them.
 */

/**
 * Built pages, listed one entry per locale.
 *
 * A path joins this list when its page stops being a stub, and the check is
 * what makes that a rule rather than an intention.
 *
 * Everything absent is absent for a reason that is either recorded below or
 * visible in the page itself: the four `/legal` pages are still `StubPage`
 * renders. They belong in the sitemap the day they carry real copy — they are a
 * launch blocker for other reasons anyway, see commerce.md — and not a day
 * earlier.
 *
 * **`/about` and `/contact` are listed, and conditional.** Their content is the
 * artist's own settings, so either can be built and still have nothing on it —
 * no About text yet, no contact details yet. While that is so, the page marks
 * itself `noindex` and `app/sitemap.js` leaves it out. Listed here because the
 * page is built; offered only when it has something to say.
 */
export const INDEXABLE_PATHS = ['/', '/gallery', '/about', '/contact'];

/**
 * Listed, but generated one entry per record rather than one per path.
 *
 * `app/sitemap.js` expands this from the works repository, which is what keeps
 * a draft out of the sitemap without anybody filtering by hand.
 */
export const GENERATED_PATHS = ['/art/[slug]'];

/**
 * Built, and deliberately never in the sitemap.
 *
 * The purchase flow is per-visitor state rather than pages with anything to
 * rank, and an order addressed by id has nothing to say to anyone but its
 * buyer. Being on this list is a decision; being on none of the three is an
 * oversight, and that is the difference the check exists to see.
 */
export const EXCLUDED_PATHS = ['/cart', '/checkout', '/order/[id]'];
