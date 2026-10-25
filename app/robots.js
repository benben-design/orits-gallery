/**
 * robots.txt
 *
 * The admin area, and the design-system page at /admin/dev inside it, are kept
 * out of search results three ways, all three in effect: here, in each one's own root-layout
 * metadata, and via an `X-Robots-Tag: noindex, nofollow, noarchive` header
 * declared in next.config.mjs — in the framework's configuration rather than
 * the host's, because a header rule written for Netlify is applied only to
 * responses it serves from its own store and never to one a function produced,
 * which every admin route is. See .claude/rules/deployment.md.
 *
 * Neither reaches the sitemap either: it is generated from the locale list and
 * the works repository — which is the only way it may be generated, see
 * seo.md — so it cannot produce a URL outside app/(site)/[locale], and both of
 * these live outside it.
 */
import { absoluteUrl } from '@/lib/site-url';
import { isSearchIndexingAllowed } from '@/lib/search-indexing';

export default function robots() {
  /*
    Before launch: nothing may be crawled, and the sitemap is not advertised —
    naming it would hand a crawler the list of every page it has just been
    told to leave alone. The sitemap itself still exists. Blocked unless
    ALLOW_SEARCH_INDEXING is exactly `true`; see lib/search-indexing.js.
  */
  if (!isSearchIndexingAllowed()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        /*
          No /dev: the design system moved under /admin, and naming a path
          that no longer exists here would only advertise that it once did.
        */
        disallow: ['/admin', '/api/'],
      },
    ],
    /* Absolute by specification: a sitemap reference in robots.txt may not be
       a relative path, which is one more thing that cannot be built without
       NEXT_PUBLIC_SITE_URL. */
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
