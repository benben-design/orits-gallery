/**
 * The data access layer for paintings.
 *
 * This is the ONLY module that pages, layouts and components may use to reach
 * painting data. Nothing outside lib/data imports lib/data/artworks.js.
 *
 * The functions are named in product terms, not storage terms — "the works on
 * show", "the work at this slug", "the most recent works" — so that the
 * internals can be swapped for a real database without a single caller
 * changing. Two rules keep that promise:
 *
 *   1. Every function is async, even though the current implementation is
 *      synchronous. Callers already await, so introducing real I/O later is
 *      invisible to them.
 *   2. Every function returns plain, serializable objects — never class
 *      instances, never database rows leaked as-is.
 *
 * See .claude/rules/data-layer.md for the rule. The schema these functions will
 * eventually read from belongs in database/, empty at this stage.
 */
import { readAllRecords, WORK_STATUSES, WORK_CATEGORIES } from './artworks';
import { defaultLocale } from '@/lib/i18n/config';

export { WORK_STATUSES, WORK_CATEGORIES };

/** Newest first. "Recent" means `addedAt` descending, ties broken by id. */
function byMostRecent(a, b) {
  if (a.addedAt === b.addedAt) return a.id.localeCompare(b.id);
  return a.addedAt < b.addedAt ? 1 : -1;
}

/**
 * Every work on show, most recent first.
 *
 * @param {object} [options]
 * @param {string} [options.category] - Restrict to one category.
 * @param {string[]} [options.statuses] - Restrict to these statuses.
 * @param {string[]} [options.excludeIds] - Drop these works from the result.
 * @returns {Promise<object[]>}
 */
export async function getAllWorks(options = {}) {
  const { category, statuses, excludeIds } = options;

  return readAllRecords()
    .filter((work) => (category ? work.category === category : true))
    .filter((work) => (statuses ? statuses.includes(work.status) : true))
    .filter((work) => (excludeIds ? !excludeIds.includes(work.id) : true))
    .sort(byMostRecent);
}

/**
 * One work, addressed by its slug in a given language.
 *
 * Each work has a separate slug per language, so the locale is part of the
 * lookup: /he/art/לימונים and /en/art/lemons are the same painting.
 *
 * @returns {Promise<object|null>} null when nothing matches.
 */
export async function getWorkBySlug(slug, locale = defaultLocale) {
  if (!slug) return null;
  const decoded = decodeURIComponent(slug);
  const works = readAllRecords();
  return works.find((work) => work.slug[locale] === decoded) ?? null;
}

/**
 * One work, addressed by its slug in *any* language.
 *
 * This is what lets the language switcher stay dumb. Switching language is a
 * plain swap of the first URL segment, so on an artwork page it produces the
 * other language's URL still carrying this language's slug — e.g.
 * /en/art/לימונים. The artwork route resolves that here and redirects to
 * the canonical /en/art/lemons, so the switcher never needs to know that
 * slugs are per-language.
 *
 * @returns {Promise<object|null>}
 */
export async function findWorkByAnySlug(slug) {
  if (!slug) return null;
  const decoded = decodeURIComponent(slug);
  return (
    readAllRecords().find((work) =>
      Object.values(work.slug).some((value) => value === decoded)
    ) ?? null
  );
}

/**
 * The most recently added works — what the homepage grid shows.
 *
 * @param {number} limit
 * @param {object} [options] - Same filters as getAllWorks.
 * @returns {Promise<object[]>}
 */
export async function getRecentWorks(limit = 12, options = {}) {
  const works = await getAllWorks(options);
  return works.slice(0, limit);
}

/**
 * One work by its stable id. Used by the admin area, where works are addressed
 * by id rather than by a language-specific slug.
 *
 * @returns {Promise<object|null>}
 */
export async function getWorkById(id) {
  if (!id) return null;
  return readAllRecords().find((work) => work.id === id) ?? null;
}

/**
 * The work featured on the homepage hero.
 *
 * Today exactly one record carries `featured`. In the database this becomes a
 * boolean column, and this function becomes a WHERE clause.
 *
 * @returns {Promise<object|null>}
 */
export async function getFeaturedWork() {
  const works = readAllRecords();
  return works.find((work) => work.featured) ?? works.sort(byMostRecent)[0] ?? null;
}

/**
 * Every (locale, slug) pair, for generateStaticParams on the artwork route.
 *
 * @returns {Promise<{locale: string, slug: string}[]>}
 */
export async function getAllWorkSlugs(locales) {
  const works = readAllRecords();
  return locales.flatMap((locale) =>
    works.map((work) => ({ locale, slug: work.slug[locale] }))
  );
}

/**
 * The slug of one work in every language, so the language switcher can move
 * between /he/art/לימונים and /en/art/lemons instead of producing a
 * dead URL.
 *
 * @returns {Promise<Record<string, string>|null>}
 */
export async function getSlugsForWork(id) {
  const work = await getWorkById(id);
  return work ? { ...work.slug } : null;
}
