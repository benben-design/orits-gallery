'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  locales,
  localeNames,
  localeHref,
  replaceLocaleInPath,
} from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import NavLabel from './NavLabel';
import styles from './LanguageSwitcher.module.css';

/**
 * Switches language without leaving the page.
 *
 * CLIENT COMPONENT. It needs the *current* pathname to rewrite, which is a
 * browser-side concern: the header is rendered once by a shared layout, so it
 * cannot be told from a page which route it is currently sitting on.
 *
 * **It offers only the languages you are not reading**, at every width — so
 * with two, one word: "English" on the Hebrew site, "עברית" on the English
 * one. The current language is never a destination, and showing it beside the
 * other meant a pair told apart only by ink, which on the header's band made
 * the utility side look greyer and smaller than the destinations opposite.
 * The document's own `lang` says which language this is.
 *
 * The rewrite is a plain swap of the first URL segment, which works because the
 * locale is always that segment. Works have a different slug per language, so
 * the swapped URL for an artwork page carries the other language's slug; the
 * artwork route resolves a slug in any language and redirects to the canonical
 * one, which keeps this component ignorant of the data layer.
 *
 * Labels arrive as props so that this file, like every other component,
 * contains no hard-coded copy.
 */
export default function LanguageSwitcher({ locale, groupLabel, switchToTemplate }) {
  const pathname = usePathname();

  return (
    <div className={styles.switcher} role="group" aria-label={groupLabel}>
      {locales
        .filter((code) => code !== locale)
        .map((code) => (
          <Link
            key={code}
            href={replaceLocaleInPath(pathname ?? '/', code) ?? localeHref(code)}
            hrefLang={code}
            lang={code}
            aria-label={interpolate(switchToTemplate, { language: localeNames[code] })}
            className={styles.option}
          >
            <NavLabel>{localeNames[code]}</NavLabel>
          </Link>
        ))}
    </div>
  );
}
