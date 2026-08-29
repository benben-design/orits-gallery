import { defaultLocale, isLocale } from './config';

/**
 * Loads the translation file for a locale.
 *
 * Every user-facing string in the app comes from here. Components receive a
 * dictionary and read from it; none of them contain literal copy, not even
 * while the copy is still placeholder text.
 *
 * Server-side only — pass the resolved strings down to client components as
 * props rather than calling this in the browser.
 */
export async function getDictionary(locale) {
  const resolved = isLocale(locale) ? locale : defaultLocale;
  const dictionary = await import(`./locales/${resolved}.json`);
  return dictionary.default;
}
