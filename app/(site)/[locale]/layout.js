import { notFound } from 'next/navigation';
import '@/app/globals.css';
import { fontVariables } from '@/app/fonts';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import CartProvider from '@/components/cart/CartProvider';
import WhatsAppButton from '@/components/layout/WhatsAppButton';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { siteUrl } from '@/lib/site-url';
import { whatsappHref } from '@/lib/contact';
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
    /*
      The base every relative URL in a page's metadata resolves against. Set
      once, here, so that no page has to remember it — and so that a page which
      does build its URLs absolutely, as the artwork page does, is agreeing with
      this rather than inventing its own answer. See lib/site-url.js.
    */
    metadataBase: new URL(siteUrl()),
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

  /**
   * The slices of the dictionary the cart drawer needs, and only those.
   *
   * The drawer is a client component, so whatever it is handed is serialized
   * into every page. The whole dictionary would carry the admin's two hundred
   * strings to every visitor for no reason. The shape is kept — `status`,
   * `price` and `artwork` sit at the top level — because `Price` and
   * `StatusBadge` read `dictionary.status[...]` and are shared with the server
   * components that render them, and a differently-shaped object would mean
   * two versions of those.
   */
  const cartDictionary = {
    cart: dictionary.cart,
    status: dictionary.status,
    price: dictionary.price,
    artwork: dictionary.artwork,
  };

  return (
    <html lang={getLocaleTag(locale)} dir={getDirection(locale)} className={fontVariables}>
      <body className={styles.body}>
        {/*
          Holds the cart's state and renders the drawer. `children` arrives
          already rendered on the server and passes straight through, which is
          what keeps the homepage and every artwork page statically generated —
          a client component hosting server components, not converting them.
        */}
        <CartProvider dictionary={cartDictionary} locale={locale}>
          <a className="skipLink" href="#main">
            {dictionary.site.skipToContent}
          </a>
          <SiteHeader locale={locale} dictionary={dictionary} />
          <main id="main" className={styles.main}>
            {children}
          </main>
          <SiteFooter locale={locale} dictionary={dictionary} year={year} />
          {/*
            The way to reach the artist directly, on every public page but
            checkout — which the button decides for itself, because a layout
            cannot know which page it is wrapping. See WhatsAppButton.

            The href is built here so the message is resolved on the server, in
            the language the visitor is reading, and the client component is
            handed nothing but a string. `whatsappHref` returns null when no
            number is configured, and then nothing renders at all.
          */}
          <WhatsAppButton
            href={whatsappHref(dictionary.nav.whatsappMessage)}
            label={dictionary.nav.whatsapp}
            locale={locale}
          />
        </CartProvider>
      </body>
    </html>
  );
}
