/**
 * robots.txt
 *
 * The admin area and the design-system page at /dev are both kept out of search
 * results three ways: here, in each one's own root-layout metadata, and via an
 * X-Robots-Tag header that
 * `vercel.json` still holds and the new host does not read — see deployment.md.
 * **That third way is not in effect until it is carried over to Netlify**, so
 * the two above are what is actually doing the work today.
 *
 * Neither reaches the sitemap either: it is generated from the locale list and
 * the works repository — which is the only way it may be generated, see
 * seo.md — so it cannot produce a URL outside app/(site)/[locale], and both of
 * these live outside it.
 */
import { absoluteUrl } from '@/lib/site-url';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/dev', '/api/'],
      },
    ],
    /* Absolute by specification: a sitemap reference in robots.txt may not be
       a relative path, which is one more thing that cannot be built without
       NEXT_PUBLIC_SITE_URL. */
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
