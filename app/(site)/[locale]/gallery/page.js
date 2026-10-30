import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkCard from '@/components/ui/ArtworkCard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getGalleryWorks } from '@/lib/data/works-repository';
import styles from './page.module.css';

/**
 * /[locale]/gallery — the full catalogue.
 *
 * A server component that reads the repository directly: no API call, no
 * loading state, and every painting present in the HTML that Google and a
 * WhatsApp preview receive. See frontend/next.md.
 *
 * **Published works only.** `getGalleryWorks` is public-scoped, so a draft the
 * artist is still filling in cannot appear here however its sale status is
 * set. That filter is enforced inside the repository rather than remembered
 * here — see data-layer.md.
 *
 * **Every work, with no filter** (decided 26-10-2026). The two category tiles
 * and the `?category=` filter were removed: the gallery is one wall of her
 * work, and at a few dozen paintings a choice in front of it is furniture. An
 * old filtered link still lands here and shows everything, because the page no
 * longer reads the query at all.
 *
 * Pagination is deliberately not built either. It becomes worth doing when the
 * catalogue is long enough that the page is slow.
 */

/**
 * Prerendered per locale and rebuilt on a window, like the homepage — possible
 * now that the page takes only `params`. The hour is a backstop: every admin
 * mutation and the payment return invalidate it as they write
 * (lib/revalidate.js clears the whole public layout by path).
 */
export const revalidate = 3600;

/** Widths this grid actually renders at, matching the homepage's. */
const CARD_SIZES = '(max-width: 40rem) 92vw, (max-width: 64rem) 44vw, 22rem';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return { title: dictionary.gallery.title };
}

export default async function GalleryPage({ params }) {
  const { locale } = await params;

  const [dictionary, works] = await Promise.all([getDictionary(locale), getGalleryWorks()]);

  return (
    <Section>
      <Container>
        {/* The page's <h1>, so each card's title is an <h2> beneath it. */}
        <SectionHeading as="h1" intro={dictionary.gallery.intro}>
          {dictionary.gallery.title}
        </SectionHeading>

        {works.length === 0 ? (
          <p className={styles.empty}>{dictionary.gallery.empty}</p>
        ) : (
          <ul className={styles.grid}>
            {works.map((work, index) => (
              <li key={work.id} className={styles.cell}>
                <ArtworkCard
                  work={work}
                  locale={locale}
                  dictionary={dictionary}
                  sizes={CARD_SIZES}
                  titleAs="h2"
                  /*
                    The first painting is the page's largest paint on a phone,
                    and it was lazy-loaded: the browser waited to ask for it,
                    and LCP was 3.9s on throttled 4G. At 390x844 it is the only
                    painting on the first screen — the second begins at 938px —
                    so it alone loads at once and at high priority; marking more
                    would have them compete with it for the same bandwidth.
                  */
                  priority={index === 0}
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
