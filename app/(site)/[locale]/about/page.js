import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import SectionLabel from '@/components/ui/SectionLabel';
import PortraitFrame from '@/components/ui/PortraitFrame';
import ArtworkCard from '@/components/ui/ArtworkCard';
import ButtonLink from '@/components/ui/ButtonLink';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { localeHref } from '@/lib/i18n/config';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { getRecentWorks } from '@/lib/data/works-repository';
import { contactMethods } from '@/lib/contact';
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
 *   3. **Three of her paintings and the way on** — to all of them, and to her.
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
  The photograph takes 5 of 12 columns from 60rem and 2 of 5 from 40rem; the
  container is 80rem less its gutters at most.
*/
const PORTRAIT_SIZES = '(min-width: 60rem) 30rem, (min-width: 40rem) 38vw, 92vw';
const CARD_SIZES = '(min-width: 48rem) 24rem, 92vw';

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

  return (
    <>
      <Section as="div" size="tight">
        <Container>
          <div className={[styles.opening, portrait ? styles.withPortrait : ''].filter(Boolean).join(' ')}>
            <div className={styles.text}>
              {/*
                The page's name, demoted to a label. Her name is the heading:
                "about" is what the page is, and she is what it is about.
              */}
              <SectionLabel>{dictionary.about.title}</SectionLabel>
              <h1 className={styles.name}>{dictionary.site.artistName}</h1>
              {lead ? <p className={styles.lead}>{lead}</p> : null}
              {rest.map((paragraph, index) => (
                <p key={index} className={styles.paragraph}>
                  {paragraph}
                </p>
              ))}
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
          </div>
        </Container>
      </Section>

      <Section size="tight">
        <Container>
          {works.length > 0 ? (
            <>
              <SectionHeading align="center">{dictionary.about.worksHeading}</SectionHeading>
              <ul className={styles.works}>
                {works.map((work) => (
                  <li key={work.id} className={styles.work}>
                    <ArtworkCard
                      work={work}
                      locale={locale}
                      dictionary={dictionary}
                      sizes={CARD_SIZES}
                    />
                  </li>
                ))}
              </ul>
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
