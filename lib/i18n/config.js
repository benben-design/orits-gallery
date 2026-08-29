/**
 * The single source of truth for languages.
 *
 * Adding a third language is meant to be a two-step job:
 *   1. add its code here (plus a direction and a display name)
 *   2. add lib/i18n/locales/<code>.json
 * Nothing else in the app enumerates languages by hand — routing, static
 * params, the <html lang/dir> attributes and the language switcher are all
 * derived from this file.
 */

/** Order matters: it is the order the language switcher renders. */
export const locales = ['he', 'en'];

/** Hebrew is the default; the bare root redirects here. */
export const defaultLocale = 'he';

/**
 * The admin area is Hebrew-only and is not locale-routed, so it pins its
 * language here rather than reading one from the URL. Pinned explicitly rather
 * than following `defaultLocale`, so that changing the public default language
 * does not silently translate the admin.
 */
export const adminLocale = 'he';

/** Writing direction per locale. Drives <html dir> — never set by hand in a page. */
export const localeDirections = {
  he: 'rtl',
  en: 'ltr',
};

/** How each language names itself, for the switcher. */
export const localeNames = {
  he: 'עברית',
  en: 'English',
};

/** BCP-47 tags for <html lang> and for Intl formatters. */
export const localeTags = {
  he: 'he-IL',
  en: 'en-US',
};

export function isLocale(value) {
  return locales.includes(value);
}

export function getDirection(locale) {
  return localeDirections[locale] ?? localeDirections[defaultLocale];
}

export function getLocaleTag(locale) {
  return localeTags[locale] ?? localeTags[defaultLocale];
}

/**
 * Build a locale-prefixed href. Every internal link in the app goes through
 * this so that no component has to know how the URL is shaped.
 *
 *   localeHref('en', '/gallery')      ->  '/en/gallery'
 *   localeHref('he', '/')             ->  '/he'
 *   localeHref('he', '/gallery/עץ')   ->  '/he/gallery/%D7%A2%D7%A5'
 *
 * Segments are percent-encoded. Hebrew slugs are real URL segments, and an
 * un-encoded one is fine inside an <a href> but illegal in a Location header —
 * so `redirect()` throws on it. Encoding here fixes both callers at once.
 * Pass raw, unencoded paths: encoding twice would mangle them.
 */
export function localeHref(locale, path = '/') {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const clean = encoded === '/' ? '' : encoded.startsWith('/') ? encoded : `/${encoded}`;
  return `/${locale}${clean}`;
}

/**
 * Swap the locale segment of an already-built pathname, keeping the user on
 * the same page. Returns null when the path is not locale-prefixed.
 *
 *   replaceLocaleInPath('/en/about', 'he')  ->  '/he/about'
 */
export function replaceLocaleInPath(pathname, nextLocale) {
  const segments = pathname.split('/');
  // segments[0] is the empty string before the leading slash.
  if (!isLocale(segments[1])) return null;
  segments[1] = nextLocale;
  return segments.join('/') || '/';
}
