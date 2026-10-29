import { Mail, Phone } from 'lucide-react';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { contactMethods, displayPhone, displayUrl } from '@/lib/contact';
import styles from './page.module.css';

/**
 * /contact — every way of reaching the artist that she has filled in.
 *
 * **WhatsApp is the move this page is built around.** Her buyers write to her
 * there, mostly from a phone, so it is the one filled accent on the page — a
 * full-width control on a phone — and everything else is a quiet list beneath
 * it: one roomy row per method, the whole row the link, what it is at the
 * start and the number or address at the far end.
 *
 * **The details are site settings**, from `/admin/settings`; the words around
 * them come from the locale files. `contactMethods` returns only the ones that
 * are set, so a field she left empty is simply not on the page — no label over
 * a blank, no link to nowhere.
 *
 * **With none set, the page is its heading and nothing else**, and it asks not
 * to be indexed; the sitemap leaves it out by the same test. The intro line is
 * shown only when there is something under it.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const settings = await getSiteSettings();

  return {
    title: dictionary.contact.title,
    ...(contactMethods(settings).length > 0 ? {} : { robots: { index: false, follow: true } }),
  };
}

/*
  The two rows that get a glyph. Instagram and Facebook get none: lucide has no
  brand marks, and the site does not draw its own — the label says what it is.
*/
const ICONS = { phone: Phone, email: Mail };

/* Pages that leave the site open in a new tab; a dialler or a mail client does not. */
const OPENS_ELSEWHERE = { whatsapp: true, instagram: true, facebook: true };

const newTab = (key) =>
  OPENS_ELSEWHERE[key] ? { target: '_blank', rel: 'noreferrer noopener' } : {};

export default async function ContactPage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const settings = await getSiteSettings();

  const methods = contactMethods(settings, dictionary.nav.whatsappMessage);
  const whatsapp = methods.find((method) => method.key === 'whatsapp');
  const rows = methods.filter((method) => method.key !== 'whatsapp');

  /*
    What each row shows at its far end. A phone number and an address are shown
    as themselves; a social page as its address without the scheme.
  */
  const valueFor = {
    phone: displayPhone(settings.phone),
    email: settings.email,
    instagram: settings.instagramUrl ? displayUrl(settings.instagramUrl) : null,
    facebook: settings.facebookUrl ? displayUrl(settings.facebookUrl) : null,
  };

  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{dictionary.contact.title}</h1>

        {methods.length > 0 ? <p className={styles.lead}>{dictionary.contact.lead}</p> : null}

        {whatsapp ? (
          <a href={whatsapp.href} className={styles.whatsapp} {...newTab('whatsapp')}>
            <WhatsAppIcon className={styles.whatsappIcon} />
            {dictionary.nav.whatsapp}
          </a>
        ) : null}

        {rows.length > 0 ? (
          <ul className={styles.rows}>
            {rows.map((method) => {
              const Icon = ICONS[method.key];

              return (
                <li key={method.key}>
                  <a href={method.href} className={styles.row} {...newTab(method.key)}>
                    <span className={styles.label}>
                      {Icon ? (
                        <Icon size={16} strokeWidth={1.5} aria-hidden="true" className={styles.icon} />
                      ) : null}
                      {dictionary.contact.methods[method.key]}
                    </span>
                    {/*
                      Two spans on purpose. The outer one follows the page's
                      direction, so `text-align: end` keeps a wrapped value at
                      the row's far end in Hebrew too; the inner one is the
                      left-to-right run itself, isolated, so a number or an
                      address reads in its own order inside a Hebrew page.
                    */}
                    <span className={styles.value}>
                      <span dir="ltr" className={styles.valueText}>
                        {valueFor[method.key]}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Container>
    </Section>
  );
}
