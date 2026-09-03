/**
 * The site's own absolute address.
 *
 * **The only reader of `NEXT_PUBLIC_SITE_URL`**, and the only place a relative
 * path becomes an absolute one. Canonical links, hreflang pairs, Open Graph
 * images and the sitemap are absolute by definition — a crawler and a chat app
 * receive the markup with no idea which host produced it — so they cannot be
 * built from the relative hrefs the rest of the site uses.
 *
 * ## Why this throws in production
 *
 * A wrong base address is worse than a missing one. It does not break a page:
 * it publishes a canonical URL pointing at somewhere that is not this site, an
 * hreflang pair that does not resolve, and a preview image that will not load,
 * all of which look fine in the markup and are only discovered weeks later in
 * search results. seo.md is blunt about the hreflang half of that — a wrong one
 * is worse than none — and deployment.md asks for a missing variable to fail
 * the build loudly rather than degrade quietly at runtime.
 *
 * So: unset in production is an error, raised while the pages that need it are
 * being built. On a laptop it falls back to the dev server's own address, which
 * is what a local canonical URL should say anyway.
 *
 * The variable is `NEXT_PUBLIC_` because it is not a secret — the address is
 * printed in the markup of every public page — and because a client component
 * may one day need it.
 */

/** What a dev server is. Never used once NODE_ENV is production. */
const DEVELOPMENT_FALLBACK = 'http://localhost:3000';

const MISSING =
  'NEXT_PUBLIC_SITE_URL is not set. It is the absolute base for canonical '
  + 'URLs, hreflang pairs, the sitemap and share images, none of which can be '
  + 'built from a relative path. Set it in .env.local for local work and in the '
  + 'hosting provider for deployment — e.g. https://example.com';

/**
 * The base, with any trailing slash removed so callers can concatenate a path
 * that starts with one.
 *
 * @returns {string}
 */
export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;

  if (!configured) {
    if (process.env.NODE_ENV === 'production') throw new Error(MISSING);
    return DEVELOPMENT_FALLBACK;
  }

  // Parsed rather than trusted: "example.com" with no scheme is the mistake
  // that produces a canonical URL the browser reads as a relative path, and it
  // is far cheaper to catch here than in a search result.
  try {
    new URL(configured);
  } catch {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not a valid absolute URL. It needs a scheme, '
        + 'e.g. https://example.com'
    );
  }

  return configured.replace(/\/+$/, '');
}

/**
 * An absolute URL for a path on this site.
 *
 * The path is used as given. Every caller builds it with `localeHref`, which
 * already percent-encodes each segment — re-encoding a Hebrew slug here would
 * double-encode it, and parsing it through `new URL` would be a second place
 * that decides what a path means.
 *
 * **A value that is already absolute is returned untouched**, and that is not
 * defensive tidying: an artwork page's share image is the painting, and a
 * painting the artist uploaded is `https://res.cloudinary.com/...` rather than
 * a path on this site. Prefixing the site address to it produced
 * `https://oritbarshai.com/https://res.cloudinary.com/...` — a share preview
 * that resolves to nothing, on the one surface where the image *is* the
 * message. It went unnoticed because every image was local until an upload
 * existed. See seo.md.
 *
 * @param {string} path - An absolute path, e.g. `/he/art/<slug>`, or an
 *   already-absolute `https://` URL.
 * @returns {string}
 */
export function absoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path;

  return siteUrl() + (path.startsWith('/') ? path : '/' + path);
}
