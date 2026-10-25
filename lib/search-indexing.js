/**
 * Whether search engines may index the public site — the one switch.
 *
 * **Blocked unless launch is explicitly enabled.** The site went Public on
 * Netlify (so the artist's family could see it) long before it is a shop, and
 * a page indexed early is expensive to take back out of search. So the safe
 * state is the default one: indexing is allowed only when
 * `ALLOW_SEARCH_INDEXING` is exactly `true`. Unset, misspelt, `TRUE` or `1` all
 * leave the site hidden — forgetting the switch can only ever hide it.
 *
 * While blocked, three layers say so, and the header is the one that matters:
 *
 *   - `X-Robots-Tag: noindex, nofollow, noarchive` on every response
 *     (next.config.mjs — never Netlify's own header rules, which never reach a
 *     response a function produced);
 *   - a robots meta on every public page (the public root layout);
 *   - a robots.txt that disallows everything and names no sitemap (app/robots.js).
 *
 * **It is read at build time.** The config's headers and the prerendered pages
 * are fixed when the site is built, so changing the variable on Netlify does
 * nothing until the next deploy. See deployment.md for the launch steps.
 *
 * Imports nothing and reads no secret: next.config.mjs loads it in plain Node.
 */

export const SEARCH_INDEXING_VARIABLE = 'ALLOW_SEARCH_INDEXING';

export function isSearchIndexingAllowed() {
  return process.env[SEARCH_INDEXING_VARIABLE] === 'true';
}
