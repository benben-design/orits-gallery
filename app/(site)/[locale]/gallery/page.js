import Link from 'next/link';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkCard from '@/components/ui/ArtworkCard';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import {
  getGalleryCategories,
  getGalleryWorks,
  WORK_CATEGORIES,
} from '@/lib/data/works-repository';
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

/** The category tiles' thumbnails, matching .tileFrame in page.module.css. */
const TILE_SIZES = '(max-width: 48rem) 3.5rem, 6rem';

/** "1 work" is its own string rather than "{count} works" with a 1 in it. */
function workCount(count, one, many) {
  return count === 1 ? one : interpolate(many, { count });
}

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
  /*
    The tiles' counts and pictures are one read of the whole catalogue — the
    same cached read, not one query per category — and independent of the
    filtered list, so the two run side by side.
  */
  const [works, categories] = await Promise.all([
    getGalleryWorks(category),
    getGalleryCategories(),
  ]);
  const total = categories.reduce((sum, tile) => sum + tile.count, 0);

  return (
    <Section>
      <Container>
        {/* The page's <h1>, so each card's title is an <h2> beneath it. */}
        <SectionHeading as="h1" intro={dictionary.gallery.intro}>
          {dictionary.gallery.title}
        </SectionHeading>

        {/*
          The filter is two picture tiles and a quiet "all". Every one is an
          ordinary link to the same address as before, so filtering still works
          with no JavaScript, is linkable, and lives in the browser's history.

          The current choice is announced (aria-current) and drawn with a
          heavier border, never with a colour change alone — the same reason a
          sale status never relies on colour.
        */}
        <nav className={styles.filters} aria-label={dictionary.gallery.filterLabel}>
          <ul className={styles.tiles}>
            {categories.map((tile) => {
              const active = tile.category === category;

              return (
                <li key={tile.category}>
                  <Link
                    href={localeHref(locale, `/gallery?category=${tile.category}`)}
                    className={[styles.tile, active ? styles.tileActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-current={active ? 'true' : undefined}
                  >
                    {/*
                      The painting is fitted inside its mat by ArtworkFrame, the
                      same component every card uses, so it is never cropped
                      here either. Its alt is empty: it stands for the category,
                      and the link's words already name it.
                    */}
                    <ArtworkFrame
                      className={styles.tileFrame}
                      image={tile.image ?? undefined}
                      alt=""
                      ratio="1 / 1"
                      sizes={TILE_SIZES}
                    />
                    <span className={styles.tileText}>
                      <span className={styles.tileName}>
                        {dictionary.category[tile.category]}
                      </span>
                      <span className={styles.tileCount}>
                        {workCount(
                          tile.count,
                          dictionary.gallery.workCountOne,
                          dictionary.gallery.workCount
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Link
            href={localeHref(locale, '/gallery')}
            className={[styles.all, category ? '' : styles.allActive].filter(Boolean).join(' ')}
            aria-current={category ? undefined : 'true'}
          >
            {dictionary.gallery.filterAll}
            <span aria-hidden="true" className={styles.allSeparator}>
              ·
            </span>
            <bdi>{total}</bdi>
          </Link>
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
