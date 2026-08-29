import Hero from '@/components/home/Hero';
import WorksGrid from '@/components/home/WorksGrid';
import PromisesRow from '@/components/home/PromisesRow';
import StorySection from '@/components/home/StorySection';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getFeaturedWork, getRecentWorks } from '@/lib/data/works-repository';

/**
 * The homepage: hero, works grid, promises, story.
 *
 * A server component that reads nothing directly — painting data comes from
 * lib/data/works-repository, never from the file the works currently happen to
 * live in. When that repository is backed by a real database, this page does
 * not change.
 */

/** Number of works in the homepage grid. */
const GRID_SIZE = 12;

export default async function HomePage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  const featured = await getFeaturedWork();
  const works = await getRecentWorks(GRID_SIZE, {
    /* The hero already has this one hanging; do not show it twice. */
    excludeIds: featured ? [featured.id] : [],
  });

  return (
    <>
      <Hero work={featured} locale={locale} dictionary={dictionary} />
      <WorksGrid works={works} locale={locale} dictionary={dictionary} />
      <PromisesRow dictionary={dictionary} />
      <StorySection locale={locale} dictionary={dictionary} />
    </>
  );
}
