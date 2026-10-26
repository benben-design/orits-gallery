import Hero from '@/components/home/Hero';
import WorksGrid from '@/components/home/WorksGrid';
import PromisesRow from '@/components/home/PromisesRow';
import StorySection from '@/components/home/StorySection';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { getFeaturedWorks, getRecentWorks } from '@/lib/data/works-repository';

/**
 * The homepage: hero, works grid, promises, story.
 *
 * A server component that reads nothing directly — painting data comes from
 * lib/data/works-repository, never from the file the works currently happen to
 * live in. When that repository is backed by a real database, this page does
 * not change.
 *
 * **The grid is the works the artist starred** in the admin's list
 * (`featured`, any number since migration 015), newest first. With none
 * starred it falls back to the most recent works, so the homepage is never an
 * empty wall because every star was taken off.
 */

/**
 * Prerendered, and rebuilt at most once an hour.
 *
 * This page takes only `params`, so it has nothing per-request in it and can be
 * a static page for both languages — which is what stops every visit querying
 * Postgres. That matters more than it used to: the production database sleeps
 * after five minutes of quiet on its plan, so an uncached visit can pay a
 * wake-up on top of the query.
 *
 * **The hour is a backstop, not the mechanism.** Every admin mutation and the
 * verified payment return call `revalidatePublicSite()`, so a save or a sale
 * appears immediately. The window only catches a change that reached the
 * database without going through either.
 *
 * The gallery is prerendered the same way.
 */
export const revalidate = 3600;

/** How many recent works stand in when nothing is starred. */
const FALLBACK_SIZE = 12;

export default async function HomePage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  const featured = await getFeaturedWorks();
  const works = featured.length > 0 ? featured : await getRecentWorks(FALLBACK_SIZE);
  const { portrait } = await getSiteSettings();

  return (
    <>
      <Hero locale={locale} dictionary={dictionary} />
      <WorksGrid works={works} locale={locale} dictionary={dictionary} />
      <PromisesRow dictionary={dictionary} />
      <StorySection locale={locale} dictionary={dictionary} portrait={portrait} />
    </>
  );
}
