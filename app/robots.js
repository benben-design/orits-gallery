/**
 * robots.txt
 *
 * The admin area is kept out of search results here, in the admin layout's
 * metadata, and via an X-Robots-Tag header in vercel.json.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
  };
}
