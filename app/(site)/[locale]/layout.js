import { notFound } from 'next/navigation';
import '@/app/globals.css';
import { fontVariables } from '@/app/fonts';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { locales, isLocale, getDirection, getLocaleTag } from '@/lib/i18n/config';
import styles from './layout.module.css';

/**
 * Root layout for the public site, and the one place where language and text
 * direction are decided.
 *
 * `lang` and `dir` are derived from the URL's locale segment and set here on
 * <html>. No page, section or component sets either by hand — everything below
 * inherits direction, and the stylesheets use logical properties
 * (inline-start/end, margin-inline) so RTL falls out with no per-page work.
 *
 * The admin area has its own root layout under app/(admin), which is why this
 * one lives in a route group and there is no top-level app/layout.js.
 */

/** Pre-render one shell per language at build time. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Note: `dynamicParams` is deliberately NOT set to false here. Setting it on
 * this layout applies to the whole subtree, which would 404 the artwork route's
 * cross-language slugs (/en/art/לימונים) before that route could redirect
 * them to the canonical URL — breaking the language switcher on artwork pages.
 * Unknown locales are rejected by the isLocale check below instead, and the
 * proxy never routes a non-locale first segment here in the first place.
 */

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return {
    title: {
      default: dictionary.site.title,
      template: `%s — ${dictionary.site.artistName}`,
    },
    description: dictionary.site.description,
  };
}

export default async function SiteLayout({ children, params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);

  /**
   * Resolved once, on the server, at build time. Calling new Date() during
   * render on both sides of hydration is a classic mismatch source.
   */
  const year = new Date().getFullYear();

  return (
    <html lang={getLocaleTag(locale)} dir={getDirection(locale)} className={fontVariables}>
      <body className={styles.body}>
        <a className="skipLink" href="#main">
          {dictionary.site.skipToContent}
        </a>
        <SiteHeader locale={locale} dictionary={dictionary} />
        <main id="main" className={styles.main}>
          {children}
        </main>
        <SiteFooter locale={locale} dictionary={dictionary} year={year} />
      </body>
    </html>
  );
}
