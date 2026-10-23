import Link from 'next/link';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkCard from '@/components/ui/ArtworkCard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { localeHref } from '@/lib/i18n/config';
import { getGalleryWorks, WORK_CATEGORIES } from '@/lib/data/works-repository';
import styles from './page.module.css';

/**
 * /[locale]/gallery — the full catalogue.
 *
 * A server component that reads the repository directly: no API call, no
 * loading state, and every painting present in the HTML that Google and a
 * WhatsApp preview receive. See frontend/next.md.
 *
 * **Published works only.** `getAllWorks` is public-scoped, so a draft the
 * artist is still filling in cannot appear here however its sale status is
 * set. That filter is enforced inside the repository rather than remembered
 * here — see data-layer.md.
 *
 * Filtering is a query parameter and a set of links, not a client component.
 * The whole page re-renders on the server for each filter, which costs one
 * cheap query and means the filters work with no JavaScript at all, are
 * linkable, and are in the browser's history.
 *
 * Pagination is deliberately not built. There are sixteen works; a pager over
 * sixteen items is furniture. It becomes worth doing when the catalogue is
 * long enough that the page is slow, and it should be added together with the
 * decision about how filters and pages combine in a URL.
 */

/** Widths this grid actually renders at, matching the homepage's. */
const CARD_SIZES = '(max-width: 40rem) 92vw, (max-width: 64rem) 44vw, 22rem';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return { title: dictionary.gallery.title };
}

export default async function GalleryPage({ params, searchParams }) {
  const { locale } = await params;
  const query = await searchParams;

  const dictionary = await getDictionary(locale);

  /**
   * An unknown category is treated as no filter rather than as an error.
   *
   * The value comes from a URL, so anyone can type anything into it. Checking
   * it against the exported constant means a hand-edited link shows the whole
   * gallery instead of an empty page or a database error.
   */
  const requested = typeof query?.category === 'string' ? query.category : null;
  const category = WORK_CATEGORIES.includes(requested) ? requested : null;

  /**
   * The cached catalogue read. See `getGalleryWorks`.
   *
   * **There is deliberately no `export const revalidate` on this page.** It
   * reads `searchParams` above, so it renders per request whatever window is
   * declared here — the window would look like caching and do nothing. What is
   * cached is the database read, which is where the cost actually is.
   *
   * `category` is passed as a string or null rather than an options object
   * because it is part of the cache key.
   */
  const works = await getGalleryWorks(category);

  const filters = [
    { value: null, label: dictionary.gallery.filterAll },
    ...WORK_CATEGORIES.map((value) => ({
      value,
      label: dictionary.category[value],
    })),
  ];

  return (
    <Section>
      <Container>
        {/* The page's <h1>, so each card's title is an <h2> beneath it. */}
        <SectionHeading as="h1" label={dictionary.gallery.label} intro={dictionary.gallery.intro}>
          {dictionary.gallery.title}
        </SectionHeading>

        <nav className={styles.filters} aria-label={dictionary.gallery.filterLabel}>
          <ul className={styles.filterList}>
            {filters.map((filter) => {
              const active = filter.value === category;

              return (
                <li key={filter.value ?? 'all'}>
                  <Link
                    href={localeHref(
                      locale,
                      filter.value ? `/gallery?category=${filter.value}` : '/gallery'
                    )}
                    className={[styles.filter, active ? styles.filterActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    /*
                      The current filter is announced rather than only drawn
                      differently — the same reason a sale status never relies
                      on colour alone.
                    */
                    aria-current={active ? 'true' : undefined}
                  >
                    {filter.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {works.length === 0 ? (
          <p className={styles.empty}>
            {category ? dictionary.gallery.emptyInCategory : dictionary.gallery.empty}
          </p>
        ) : (
          <ul className={styles.grid}>
            {works.map((work) => (
              <li key={work.id} className={styles.cell}>
                <ArtworkCard
                  work={work}
                  locale={locale}
                  dictionary={dictionary}
                  sizes={CARD_SIZES}
                  titleAs="h2"
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
