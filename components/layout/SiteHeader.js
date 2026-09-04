import Link from 'next/link';
import Container from '@/components/ui/Container';
import LanguageSwitcher from './LanguageSwitcher';
import CartLink from './CartLink';
import { localeHref } from '@/lib/i18n/config';
import styles from './SiteHeader.module.css';

/**
 * The public top navigation: the artist's name as the home link, three
 * destinations, the language switcher and the cart.
 *
 * A server component. Two leaves inside it run on the client: the language
 * switcher, which needs the current path, and the cart link, which reads the
 * cart cookie to show a count — see CartLink.js for why that is not done on
 * the server.
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
        <Link href={localeHref(locale, '/')} className={styles.wordmark}>
          {dictionary.site.artistName}
        </Link>

        <nav className={styles.nav} aria-label={dictionary.nav.primaryLabel}>
          <ul className={styles.navList}>
            {links.map((link) => (
              <li key={link.key}>
                <Link href={link.href} className={styles.navLink}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.utilities}>
          <LanguageSwitcher
            locale={locale}
            groupLabel={dictionary.nav.languageLabel}
            switchToTemplate={dictionary.nav.switchTo}
          />
          <CartLink
            label={dictionary.nav.cart}
            labelWithCount={dictionary.nav.cartWithCount}
          />
        </div>
      </Container>
    </header>
  );
}
