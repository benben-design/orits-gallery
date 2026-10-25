import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { contactMethods, displayPhone, displayUrl } from '@/lib/contact';
import styles from './page.module.css';

/**
 * /contact — every way of reaching the artist that she has filled in.
 *
 * **The details are site settings**, from `/admin/settings`; the words around
 * them come from the locale files. `contactMethods` returns only the ones that
 * are set, so a field she left empty is simply not in the list — no label over
 * a blank, no link to nowhere.
 *
 * **With none set, the page is its heading and nothing else**, and it asks not
 * to be indexed; the sitemap leaves it out by the same test. The one line
 * introducing the list is shown only when there is a list, because "you can
 * reach her in any of these ways" above nothing would be untrue.
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

/* Latin runs — numbers, addresses, URLs — read left to right inside Hebrew. */
const IS_LATIN = { phone: true, email: true, instagram: true, facebook: true };

/* Pages that leave the site open in a new tab; a dialler or a mail client does not. */
const OPENS_ELSEWHERE = { whatsapp: true, instagram: true, facebook: true };

export default async function ContactPage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const settings = await getSiteSettings();

  const methods = contactMethods(settings, dictionary.nav.whatsappMessage);

  /*
    What each link says. A phone number and an address are shown as themselves;
    a social page as its address without the scheme; WhatsApp as the action,
    because its link is a chat rather than something to read.
  */
  const textFor = {
    whatsapp: dictionary.nav.whatsapp,
    phone: displayPhone(settings.phone),
    email: settings.email,
    instagram: settings.instagramUrl ? displayUrl(settings.instagramUrl) : null,
    facebook: settings.facebookUrl ? displayUrl(settings.facebookUrl) : null,
  };

  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{dictionary.contact.title}</h1>

        {methods.length > 0 ? (
          <>
            <p className={styles.lead}>{dictionary.contact.lead}</p>

            <dl className={styles.methods}>
              {methods.map((method) => (
                <div key={method.key} className={styles.row}>
                  <dt className={styles.label}>{dictionary.contact.methods[method.key]}</dt>
                  <dd className={styles.value}>
                    <a
                      href={method.href}
                      className={[styles.link, IS_LATIN[method.key] ? styles.ltr : '']
                        .filter(Boolean)
                        .join(' ')}
                      {...(OPENS_ELSEWHERE[method.key]
                        ? { target: '_blank', rel: 'noreferrer noopener' }
                        : {})}
                    >
                      {textFor[method.key]}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </Container>
    </Section>
  );
}
