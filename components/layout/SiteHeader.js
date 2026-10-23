import HomeMarkLink from './HomeMarkLink';
import Container from '@/components/ui/Container';
import Wordmark from './Wordmark';
import PrimaryNav from './PrimaryNav';
import LanguageSwitcher from './LanguageSwitcher';
import CartLink from './CartLink';
import { localeHref } from '@/lib/i18n/config';
import styles from './SiteHeader.module.css';

/**
 * The public top navigation: one bar with the artist's name centred in it —
 * the three destinations at the inline start, the language switcher and the
 * cart at the end. Every word in it is set the same way, so the two sides of
 * the name read as one row of type.
 *
 * **The WhatsApp shortcut used to be a fourth item beside "contact" and is not
 * here any more.** It is a button fixed to the corner of the screen, on every
 * public page — see components/layout/WhatsAppButton. Nothing took its place
 * in the bar: the side it left is emptier by one 44px glyph, and the name
 * stays centred either way because the outer tracks are equal.
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
 * **Below 56rem it is two short rows**: the name between the language and the
 * cart, the destinations beneath. That used to be 64rem, and losing the
 * shortcut is what moved it — the old figure was measured with the glyph in
 * the row, so it outlived the thing it was measuring. Re-measured in both
 * languages; the stylesheet carries the numbers. It is one `<nav>` and one set
 * of controls in both layouts, rearranged by grid areas.
 */
export default function SiteHeader({ locale, dictionary }) {
  const links = [
    { key: 'gallery', href: localeHref(locale, '/gallery'), label: dictionary.nav.gallery },
    { key: 'about', href: localeHref(locale, '/about'), label: dictionary.nav.about },
    { key: 'contact', href: localeHref(locale, '/contact'), label: dictionary.nav.contact },
  ];

  return (
    <header className={styles.header}>
      <Container className={styles.inner}>
        <HomeMarkLink href={localeHref(locale, '/')} className={styles.mark}>
          <Wordmark alt={dictionary.site.wordmark} className={styles.markImage} />
        </HomeMarkLink>

        <PrimaryNav
          links={links}
          label={dictionary.nav.primaryLabel}
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
