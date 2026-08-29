/**
 * robots.txt
 *
 * The admin area and the design-system page at /dev are both kept out of search
 * results three ways: here, in each one's own root-layout metadata, and via an
 * X-Robots-Tag header in vercel.json.
 *
 * Neither can reach the sitemap either, when one is built: a sitemap generated
 * from the locale list and the works repository — which is the only way it may
 * be generated, see seo.md — cannot produce a URL outside app/(site)/[locale],
 * and both of these live outside it.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/dev', '/api/'],
      },
    ],
  };
}
