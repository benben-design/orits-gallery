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
import styles from './LanguageSwitcher.module.css';

/**
 * Switches language without leaving the page.
 *
 * CLIENT COMPONENT — and the only one in the public shell. It needs the
 * *current* pathname to rewrite, which is a browser-side concern: the header is
 * rendered once by a shared layout, so it cannot be told from a page which
 * route it is currently sitting on.
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
      {locales.map((code) => {
        const isCurrent = code === locale;
        const href = replaceLocaleInPath(pathname ?? '/', code) ?? localeHref(code);

        return (
          <Link
            key={code}
            href={href}
            hrefLang={code}
            lang={code}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={interpolate(switchToTemplate, { language: localeNames[code] })}
            className={[styles.option, isCurrent ? styles.current : '']
              .filter(Boolean)
              .join(' ')}
          >
            {localeNames[code]}
          </Link>
        );
      })}
    </div>
  );
}
