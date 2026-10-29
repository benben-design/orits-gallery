import { notFound } from 'next/navigation';
import { getDictionary } from '@/lib/i18n/dictionaries';

/**
 * Every path under a locale that no other route matches — `/he/xyz`,
 * `/en/art/lemons/extra`, `/he/fr/gallery` after the proxy has prefixed it.
 *
 * It exists because `not-found.js` in a segment only handles a `notFound()`
 * thrown inside that segment. An unmatched URL never enters `[locale]` at all
 * and falls to Next's own default 404 — English, outside the header and footer,
 * which is what a mistyped link used to land on. A catch-all ranks below every
 * named route, so it takes only what nothing else wants, and hands it straight
 * to `not-found.js`.
 *
 * Out of the sitemap by declaration (`EXCLUDED_PATHS` in lib/public-routes.js),
 * and the heading guard follows `notFound()` to the page that actually renders.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  /* The same title the artwork route gives an unknown slug. */
  return { title: dictionary.notFound.title };
}

export default function MissingPage() {
  notFound();
}
