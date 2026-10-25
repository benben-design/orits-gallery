import Link from 'next/link';
import Container from '@/components/ui/Container';
import Wordmark from './Wordmark';
import HomeMarkLink from './HomeMarkLink';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { displayPhone, telHref, mailtoHref, whatsappHref } from '@/lib/contact';
import styles from './SiteFooter.module.css';

/**
 * The public footer: the studio's name, the site's own destinations, social
 * links, contact details and the legal pages — the ending of every page.
 *
 * **Two parts always render**: the wordmark with its one line, and the column
 * of the site's own pages. Before they existed, a site whose settings were
 * still empty ended every page on a lone column of legal links, which read as
 * something unfinished rather than as an ending.
 *
 * **The social links and contact details are site settings**, edited by the
 * artist at `/admin/settings` and handed down by the layout. Each is rendered
 * only when it is filled in, and a column left with nothing in it is not
 * rendered at all — no heading over an empty list, no placeholder, no link to
 * nowhere. The stylesheet sizes the row to however many columns remain.
 *
 * The copyright year is fixed at build time rather than read from `new Date()`
 * in render, which would differ between the server and the browser and produce
 * a hydration mismatch.
 */
export default function SiteFooter({ locale, dictionary, year, contact }) {
  const pages = [
    { key: 'gallery', href: localeHref(locale, '/gallery'), label: dictionary.nav.gallery },
    { key: 'about', href: localeHref(locale, '/about'), label: dictionary.nav.about },
    { key: 'contact', href: localeHref(locale, '/contact'), label: dictionary.nav.contact },
  ];

  const social = [
    { key: 'instagram', href: contact.instagramUrl, label: dictionary.footer.social.instagram },
    { key: 'facebook', href: contact.facebookUrl, label: dictionary.footer.social.facebook },
  ].filter((item) => item.href);

  const whatsapp = whatsappHref(contact.whatsappNumber, dictionary.nav.whatsappMessage);
  const phoneHref = telHref(contact.phone);
  const emailHref = mailtoHref(contact.email);

  const legal = [
    { key: 'terms', href: localeHref(locale, '/legal/terms'), label: dictionary.legal.terms.title },
    { key: 'shipping', href: localeHref(locale, '/legal/shipping-returns'), label: dictionary.legal.shipping.title },
    { key: 'privacy', href: localeHref(locale, '/legal/privacy'), label: dictionary.legal.privacy.title },
    { key: 'accessibility', href: localeHref(locale, '/legal/accessibility'), label: dictionary.legal.accessibility.title },
  ];

  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.top}>
          <div className={styles.brand}>
            <HomeMarkLink href={localeHref(locale, '/')} className={styles.mark}>
              <Wordmark alt={dictionary.site.wordmark} className={styles.markImage} />
            </HomeMarkLink>
            <p className={styles.tagline}>{dictionary.footer.tagline}</p>
          </div>

          <div className={styles.columns}>
            <nav className={styles.column} aria-labelledby="footer-site">
              <h2 id="footer-site" className={styles.columnTitle}>{dictionary.footer.siteLabel}</h2>
              <ul className={styles.list}>
                {pages.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className={styles.link}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {social.length > 0 ? (
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
            ) : null}

            {whatsapp || emailHref || phoneHref ? (
              <section className={styles.column}>
                <h2 className={styles.columnTitle}>{dictionary.footer.contactLabel}</h2>
                <address className={styles.list}>
                  {/* WhatsApp first, as everywhere else: it is how her buyers
                      talk to a seller. Named rather than numbered — the number
                      is a link target, and the phone line below is the number
                      to read out. */}
                  {whatsapp ? (
                    <a href={whatsapp} className={styles.link} rel="noreferrer noopener" target="_blank">
                      {dictionary.contact.methods.whatsapp}
                    </a>
                  ) : null}
                  {emailHref ? (
                    <a href={emailHref} className={styles.link + ' ' + styles.ltr}>
                      {contact.email}
                    </a>
                  ) : null}
                  {phoneHref ? (
                    <a href={phoneHref} className={styles.link + ' ' + styles.ltr}>
                      {displayPhone(contact.phone)}
                    </a>
                  ) : null}
                </address>
              </section>
            ) : null}

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
