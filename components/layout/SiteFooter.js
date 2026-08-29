import Link from 'next/link';
import Container from '@/components/ui/Container';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import styles from './SiteFooter.module.css';

/**
 * The public footer: social links, contact details and the legal pages.
 *
 * The social hrefs point at the reserved `.invalid` TLD on purpose — they are
 * stand-ins, and a stand-in that resolves to a real site is worse than one that
 * visibly does not. Swap them when the real accounts exist.
 *
 * The copyright year is fixed at build time rather than read from `new Date()`
 * in render, which would differ between the server and the browser and produce
 * a hydration mismatch.
 */
export default function SiteFooter({ locale, dictionary, year }) {
  const social = [
    { key: 'instagram', href: 'https://instagram.example.invalid', label: dictionary.footer.social.instagram },
    { key: 'facebook', href: 'https://facebook.example.invalid', label: dictionary.footer.social.facebook },
  ];

  const legal = [
    { key: 'terms', href: localeHref(locale, '/legal/terms'), label: dictionary.legal.terms.title },
    { key: 'shipping', href: localeHref(locale, '/legal/shipping-returns'), label: dictionary.legal.shipping.title },
    { key: 'privacy', href: localeHref(locale, '/legal/privacy'), label: dictionary.legal.privacy.title },
    { key: 'accessibility', href: localeHref(locale, '/legal/accessibility'), label: dictionary.legal.accessibility.title },
  ];

  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.columns}>
          <section className={styles.column}>
            <h2 className={styles.columnTitle}>{dictionary.footer.followLabel}</h2>
            <ul className={styles.list}>
              {social.map((item) => (
                <li key={item.key}>
                  <a
                    href={item.href}
                    className={styles.link}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.column}>
            <h2 className={styles.columnTitle}>{dictionary.footer.contactLabel}</h2>
            <address className={styles.list}>
              <p>{dictionary.footer.emailPlaceholder}</p>
              <p>{dictionary.footer.phonePlaceholder}</p>
            </address>
          </section>

          <section className={styles.column}>
            <h2 className={styles.columnTitle}>{dictionary.footer.legalLabel}</h2>
            <ul className={styles.list}>
              {legal.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className={styles.link}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className={styles.rights}>
          {interpolate(dictionary.footer.rights, {
            year,
            artist: dictionary.site.artistName,
          })}
        </p>
      </Container>
    </footer>
  );
}
