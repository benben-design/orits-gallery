import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import PortraitFrame from '@/components/ui/PortraitFrame';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getSiteSettings } from '@/lib/data/settings-repository';
import styles from './page.module.css';

/**
 * /about — the artist, in her own words, beside her photograph.
 *
 * **Both halves are site settings**, written and uploaded by her at
 * `/admin/settings`: the text in Hebrew with an English she has approved, the
 * photograph in its own folder on the image host. Nothing here comes from the
 * locale files except the page's name.
 *
 * **Either half may be missing, and the page holds its shape.** No photograph:
 * the text stands alone at its measure, with no frame waiting beside it. No
 * text: the page has nothing to say, so it asks not to be indexed and the
 * sitemap leaves it out — see app/sitemap.js, which applies the same test.
 * A built page with nothing on it is not something to hand a search engine.
 */
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
  const { about, portrait } = await getSiteSettings();

  const paragraphs = toParagraphs(about[locale]);

  return (
    <Section as="div">
      <Container>
        <div className={[styles.layout, portrait ? styles.withPortrait : ''].filter(Boolean).join(' ')}>
          {/*
            Filling its slot, cropped from the top if it must be — the one image
            the never-crop rule does not cover, because it is her rather than a
            work for sale. See PortraitFrame.
          */}
          {portrait ? (
            <PortraitFrame
              image={portrait}
              alt={dictionary.site.artistName}
              sizes="(min-width: 48rem) 40vw, 100vw"
              priority
            />
          ) : null}

          <div className={styles.text}>
            <h1 className={styles.title}>{dictionary.about.title}</h1>
            {paragraphs.map((paragraph, index) => (
              <p key={index} className={styles.paragraph}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
