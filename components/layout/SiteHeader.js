import Link from 'next/link';
import Container from '@/components/ui/Container';
import Wordmark from './Wordmark';
import PrimaryNav from './PrimaryNav';
import LanguageSwitcher from './LanguageSwitcher';
import CartLink from './CartLink';
import { localeHref } from '@/lib/i18n/config';
import { whatsappHref } from '@/lib/contact';
import styles from './SiteHeader.module.css';

/**
 * The public top navigation: one bar with the artist's name centred in it —
 * the three destinations and the WhatsApp shortcut at the inline start, the
 * language switcher and the cart at the end. Every word in it is set the same
 * way, so the two sides of the name read as one row of type.
 *
 * A server component. Three leaves inside it run on the client: the primary
 * navigation, which marks the current page; the language switcher, which needs
 * the current path; and the cart link, which reads the cart cookie to show a
 * count — see CartLink.js for why that is not done on the server.
 *
 * **The name is centred because that is the one position that is the same in
 * both languages.** Everything else here mirrors between Hebrew and English; a
 * centred mark does not move.
 *
 * This was briefly a two-tier masthead — the name large on a row of its own,
 * condensing to this bar on scroll. The bar alone was preferred: it is the
 * same at the top of the page as everywhere else, and it costs the first screen
 * one row instead of two.
 *
 * **Below 64rem it is two short rows** — a phone and a tablet alike: the name
 * between the language and the cart, the destinations beneath. Three links, a
 * shortcut, a name, a language and a cart do not fit one row until then, which
 * was measured rather than assumed — see the stylesheet. It is one `<nav>` and
 * one set of controls in both layouts, rearranged by grid areas.
 */
export default function SiteHeader({ locale, dictionary }) {
  const links = [
    { key: 'gallery', href: localeHref(locale, '/gallery'), label: dictionary.nav.gallery },
    { key: 'about', href: localeHref(locale, '/about'), label: dictionary.nav.about },
    { key: 'contact', href: localeHref(locale, '/contact'), label: dictionary.nav.contact },
  ];

  /* Built here rather than in the navigation so the message is resolved on the
     server, in the visitor's language, and the client component is only handed
     a URL. Null when no number is configured, and then nothing renders. */
  const whatsapp = {
    href: whatsappHref(dictionary.nav.whatsappMessage),
    label: dictionary.nav.whatsapp,
  };

  return (
    <header className={styles.header}>
      <Container className={styles.inner}>
        <Link href={localeHref(locale, '/')} className={styles.mark}>
          <Wordmark alt={dictionary.site.wordmark} className={styles.markImage} />
        </Link>

        <PrimaryNav
          links={links}
          label={dictionary.nav.primaryLabel}
          shortcut={whatsapp}
          className={styles.nav}
        />

        <div className={styles.utilities}>
          <div className={styles.lang}>
            <LanguageSwitcher
              locale={locale}
              groupLabel={dictionary.nav.languageLabel}
              switchToTemplate={dictionary.nav.switchTo}
            />
          </div>
          <div className={styles.cart}>
            <CartLink
              label={dictionary.nav.cart}
              labelWithCount={dictionary.nav.cartWithCount}
            />
          </div>
        </div>
      </Container>
    </header>
  );
}
