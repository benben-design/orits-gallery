import Hero from '@/components/home/Hero';
import WorksGrid from '@/components/home/WorksGrid';
import PromisesRow from '@/components/home/PromisesRow';
import StorySection from '@/components/home/StorySection';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getRecentWorks } from '@/lib/data/works-repository';

/**
 * The homepage: hero, works grid, promises, story.
 *
 * A server component that reads nothing directly — painting data comes from
 * lib/data/works-repository, never from the file the works currently happen to
 * live in. When that repository is backed by a real database, this page does
 * not change.
 *
 * The hero is studio footage rather than a painting, so nothing is excluded
 * from the grid any more: no work is hanging above it to be shown twice. The
 * `featured` flag on a work is therefore unused by this page — it is kept for
 * the homepage's Open Graph image, which seo.md specifies as the featured work
 * and which has not been built yet.
 */

/** Number of works in the homepage grid. */
const GRID_SIZE = 12;

export default async function HomePage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  const works = await getRecentWorks(GRID_SIZE);

  return (
    <>
      <Hero dictionary={dictionary} />
      <WorksGrid works={works} locale={locale} dictionary={dictionary} />
      <PromisesRow dictionary={dictionary} />
      <StorySection locale={locale} dictionary={dictionary} />
    </>
  );
}
