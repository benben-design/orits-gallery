import { Mail, Phone } from 'lucide-react';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import SectionLabel from '@/components/ui/SectionLabel';
import PortraitFrame from '@/components/ui/PortraitFrame';
import ArtworkWall from '@/components/ui/ArtworkWall';
import ButtonLink from '@/components/ui/ButtonLink';
import SocialLinks from '@/components/ui/SocialLinks';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { localeHref } from '@/lib/i18n/config';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { getRecentWorks } from '@/lib/data/works-repository';
import { contactMethods, displayPhone, mailtoHref, telHref } from '@/lib/contact';
import styles from './page.module.css';

/**
 * /about — who painted them.
 *
 * A buyer opens this page to decide whether to trust the person behind the
 * work, so it is built as an answer to that rather than as a page of text:
 *
 *   1. **Her name is the heading**, and "About" shrinks to the label above it.
 *      The page's name says what kind of page this is; her name says whose.
 *   2. **Her first paragraph is the lead**, set larger, and the rest of her
 *      text follows it at reading size, beside her photograph. Nothing in it
 *      is ours — which paragraph leads is simply which one she wrote first,
 *      so reordering her text in the admin is how she changes it.
 *   3. **Her story ends on how to reach her** — phone, email, her Instagram
 *      and Facebook, signed off under a short rule the way a letter ends,
 *      rather than as a block of fields. Each is a site setting; an empty one
 *      is simply absent, and with none there is no sign-off.
 *   4. **Three of her paintings and the way on** — to all of them, and to her.
 *      A page about a painter used to end with no painting on it and nowhere
 *      to go.
 *
 * **Her text and her photograph are site settings**, from `/admin/settings`,
 * and the paintings come from the repository. Only the labels come from the
 * locale files.
 *
 * **Anything may be missing, and the page holds its shape.** No photograph:
 * her text alone, at its measure. No text at all: the page asks not to be
 * indexed and the sitemap leaves it out — see app/sitemap.js, which applies
 * the same test. The paintings do not change that: they are on every other
 * page too, and her words are what this one is for.
 */

/**
 * Prerendered per language, like the homepage, and for the same reason: it
 * takes only `params`, and now it reads the catalogue as well as the settings.
 * Every admin save and the payment return invalidate it through
 * `revalidatePublicSite()`; the hour only catches a change that bypassed both.
 */
export const revalidate = 3600;

/** How many of her works close the page. A glimpse, not a second gallery. */
const WORKS_SHOWN = 3;

/*
  The photograph takes 5 of 12 columns from 60rem and 2 of 5 from 40rem, and
  about 60% of a phone's width below that; the container is 80rem less its
  gutters at most.
*/
const PORTRAIT_SIZES = '(min-width: 60rem) 30rem, (min-width: 40rem) 38vw, 56vw';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const settings = await getSiteSettings();

  return {
    title: dictionary.about.title,
    ...(settings.about.he ? {} : { robots: { index: false, follow: true } }),
  };
}

/**
 * Her text as paragraphs. A blank line is a paragraph break; a single line
 * break inside one is kept by the stylesheet rather than turned into markup.
 */
function toParagraphs(text) {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const settings = await getSiteSettings();
  const works = await getRecentWorks(WORKS_SHOWN);

  const [lead, ...rest] = toParagraphs(settings.about[locale]);
  const { portrait } = settings;
  const canContact = contactMethods(settings).length > 0;

  const phoneHref = telHref(settings.phone);
  const emailHref = mailtoHref(settings.email);
  const hasSignOff = Boolean(phoneHref || emailHref || settings.instagramUrl || settings.facebookUrl);

  return (
    <>
      <Section as="div" size="tight">
        <Container>
          {/*
            Three parts, in the order a phone shows them and a screen reader
            reads them: who (label and name), her face, then her words. The
            photograph comes straight after her name in the source, not after
            her text: moving it there with CSS alone would show it second on a
            phone and read it last, two orders for one page. From 40rem the
            same three parts are placed in two columns, so the desktop looks
            as it did, with the words and the face sharing one top edge.
          */}
          <div className={[styles.opening, portrait ? styles.withPortrait : ''].filter(Boolean).join(' ')}>
            <div className={styles.head}>
              {/*
                The page's name, demoted to a label. Her name is the heading:
                "about" is what the page is, and she is what it is about.
              */}
              <SectionLabel>{dictionary.about.title}</SectionLabel>
              <h1 className={styles.name}>{dictionary.site.artistName}</h1>
            </div>

            {/*
              Filling its slot, cropped from the top if it must be — the one
              still image the never-crop rule does not cover, because it is her
              rather than a work for sale. See PortraitFrame.
            */}
            {portrait ? (
              <PortraitFrame
                className={styles.portrait}
                image={portrait}
                alt={dictionary.site.artistName}
                sizes={PORTRAIT_SIZES}
                priority
              />
            ) : null}

            {lead || hasSignOff ? (
              <div className={styles.body}>
                {lead ? <p className={styles.lead}>{lead}</p> : null}
                {rest.map((paragraph, index) => (
                  <p key={index} className={styles.paragraph}>
                    {paragraph}
                  </p>
                ))}

                {/*
                  The sign-off. An <address> because that is what it is: the
                  ways to reach the person the page is about. Its label is in
                  the display face, a quiet echo of her name above, so it reads
                  as the close of her words rather than a form appended to them.
                  The number shows in its local form and dials the
                  international one; each value is its own left-to-right run.
                */}
                {hasSignOff ? (
                  <address className={styles.signOff}>
                    <p className={styles.signOffLabel}>{dictionary.about.signOff}</p>
                    {phoneHref || emailHref ? (
                      <ul className={styles.signOffLinks}>
                        {phoneHref ? (
                          <li>
                            <a href={phoneHref} className={styles.signOffLink}>
                              <Phone size={18} strokeWidth={1.5} aria-hidden="true" className={styles.signOffIcon} />
                              <span dir="ltr">{displayPhone(settings.phone)}</span>
                            </a>
                          </li>
                        ) : null}
                        {emailHref ? (
                          <li>
                            <a href={emailHref} className={styles.signOffLink}>
                              <Mail size={18} strokeWidth={1.5} aria-hidden="true" className={styles.signOffIcon} />
                              <span dir="ltr">{settings.email}</span>
                            </a>
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                    <SocialLinks
                      instagramUrl={settings.instagramUrl}
                      facebookUrl={settings.facebookUrl}
                      labels={dictionary.contact.social}
                      className={styles.signOffSocial}
                    />
                  </address>
                ) : null}
              </div>
            ) : null}
          </div>
        </Container>
      </Section>

      <Section size="tight">
        <Container>
          {works.length > 0 ? (
            <>
              {/*
                At the start, like the homepage's heading over the same wall,
                so the page reads down one edge from her name to her paintings
                rather than switching to a centred axis halfway. The works hang
                on the wall the gallery uses, capped at three columns because
                there are three.
              */}
              <SectionHeading>{dictionary.about.worksHeading}</SectionHeading>
              <ArtworkWall works={works} locale={locale} dictionary={dictionary} maxColumns={3} />
            </>
          ) : null}

          {/*
            The one filled accent on the page, into the paintings — the same
            words as the homepage's, because it is the same action. Reaching
            her is the quiet second: the floating WhatsApp button is already in
            the corner, so this goes to every way she can be reached rather
            than repeating that one. It is absent when she has filled none in,
            because the contact page would then be a heading and nothing else.
          */}
          <div className={styles.actions}>
            <ButtonLink href={localeHref(locale, '/gallery')} variant="primary">
              {dictionary.home.hero.cta}
            </ButtonLink>
            {canContact ? (
              <ButtonLink href={localeHref(locale, '/contact')} variant="quiet">
                {dictionary.about.contactLink}
              </ButtonLink>
            ) : null}
          </div>
        </Container>
      </Section>
    </>
  );
}
