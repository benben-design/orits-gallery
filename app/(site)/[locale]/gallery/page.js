import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkWall from '@/components/ui/ArtworkWall';
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

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return { title: dictionary.gallery.title };
}

export default async function GalleryPage({ params }) {
  const { locale } = await params;

  const [dictionary, works] = await Promise.all([getDictionary(locale), getGalleryWorks()]);

  return (
    /*
      The About page's tight gap above, so the heading sits where hers does,
      and none of its own below: the footer already
      keeps a standard step above itself on every page, and the wall ends
      level now with nothing after it, so a gap of the section's own on top of
      that left an empty band under the last captions — 168px at 1440. The
      homepage fills the same place with its link to the gallery. 30-10-2026.
    */
    <Section size="flush" before="tight">
      <Container>
        {/* The page's <h1>, so each card's title is an <h2> beneath it. */}
        <SectionHeading as="h1" intro={dictionary.gallery.intro}>
          {dictionary.gallery.title}
        </SectionHeading>

        {works.length === 0 ? (
          <p className={styles.empty}>{dictionary.gallery.empty}</p>
        ) : (
          /*
            The first painting is the page's largest paint on a phone,
            and it was lazy-loaded: LCP was 3.9s on throttled 4G. It alone
            loads at once and at high priority — marking more would have
            them compete for the same bandwidth.
          */
          <ArtworkWall
            works={works}
            locale={locale}
            dictionary={dictionary}
            titleAs="h2"
            priorityFirst
          />
        )}
      </Container>
    </Section>
  );
}
