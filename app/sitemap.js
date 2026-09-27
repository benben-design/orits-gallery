import { locales, defaultLocale, localeHref, getLocaleTag } from '@/lib/i18n/config';
import { getAllWorks } from '@/lib/data/works-repository';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { contactMethods } from '@/lib/contact';
import { absoluteUrl } from '@/lib/site-url';
import { INDEXABLE_PATHS } from '@/lib/public-routes';

/**
 * sitemap.xml
 *
 * **Generated from the locale list and the works repository, and from nothing
 * else** — which seo.md says is the only way it may be generated, and which is
 * what makes two things true without anyone remembering them:
 *
 *   - **No draft can appear.** `getAllWorks` is public-scoped, so a work with
 *     no publication timestamp is absent here exactly as it is absent from the
 *     gallery. Listing one would invite Google to index a page this site
 *     deliberately does not serve.
 *   - **Nothing outside `app/(site)/[locale]` can appear.** The admin and `/dev`
 *     are not in the locale tree, so there is no URL shape here that could
 *     reach them. That is why `app/robots.js` says they are covered three ways
 *     and the sitemap is not one of the three — it cannot name them at all.
 *
 * Adding a language is still the two-step job i18n.md promises: this file
 * enumerates `locales` and never spells out a language.
 *
 * **It offers only pages that exist.** Which paths those are is declared in
 * `lib/public-routes.js` rather than here, because `scripts/check-sitemap.mjs`
 * reads the same declaration and holds it against what is on disk: a stub
 * cannot be listed, and a finished page cannot be silently left out. Six stubs
 * were listed here before that check existed, which is precisely how thin
 * content gets indexed on a first deployment.
 */

/**
 * The alternates block for one page, given a function from locale to path.
 *
 * Every entry declares every language including itself, which is what makes the
 * pairing reciprocal — the property seo.md asks for and the one a lopsided
 * hreflang set fails.
 */
function alternatesFor(pathFor) {
  const languages = Object.fromEntries(
    locales.map((locale) => [getLocaleTag(locale), absoluteUrl(pathFor(locale))])
  );

  languages['x-default'] = absoluteUrl(pathFor(defaultLocale));

  return { languages };
}

export default async function sitemap() {
  const works = await getAllWorks();
  const settings = await getSiteSettings();

  /*
    The two pages whose content is the artist's own settings are offered only
    when they have some. Each page applies the same test to its own robots
    metadata, so the sitemap never lists a page that asks not to be indexed.
    The About text is stored in both languages or neither, so one test covers
    every locale.
  */
  const hasNothingToSay = {
    '/about': !settings.about.he,
    '/contact': contactMethods(settings).length === 0,
  };

  const offered = INDEXABLE_PATHS.filter((path) => !hasNothingToSay[path]);

  const pages = locales.flatMap((locale) =>
    offered.map((path) => ({
      url: absoluteUrl(localeHref(locale, path)),
      alternates: alternatesFor((other) => localeHref(other, path)),
    }))
  );

  /*
    One entry per painting per language, because /he/art/<slug> and
    /en/art/<slug> are different URLs serving the same work in different
    languages — which is precisely what the alternates on each entry say.

    lastModified is the publication date rather than "now": a sitemap that
    claims every page changed today teaches a crawler to ignore the field.
  */
  const artworks = locales.flatMap((locale) =>
    works.map((work) => ({
      url: absoluteUrl(localeHref(locale, `/art/${work.slug[locale]}`)),
      lastModified: work.publishedAt ?? undefined,
      alternates: alternatesFor((other) => localeHref(other, `/art/${work.slug[other]}`)),
    }))
  );

  return [...pages, ...artworks];
}
