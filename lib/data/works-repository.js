/**
 * The data access layer for paintings, backed by Postgres.
 *
 * This is the ONLY module that pages, layouts and components may use to reach
 * painting data, and the only module that touches the database connection.
 * Nothing outside lib/data imports lib/data/artworks.js — that file is now the
 * seed fixture for local development, not the storage. See
 * .claude/rules/data-layer.md.
 *
 * The exported surface is unchanged from the file-backed version: same names,
 * same arguments, same returned shapes. That was the point of the indirection.
 * Two rules keep it that way:
 *
 *   1. Every function is async. It always was, precisely so that this change
 *      would be invisible to callers.
 *   2. Every function returns plain, serializable objects — never a database
 *      row leaked as-is.
 *
 * Every query is parameterized. No value from a caller is ever concatenated
 * into SQL.
 */
import { getPool } from '@/lib/db';
import { WORK_STATUSES, WORK_CATEGORIES } from './artworks';
import imageManifest from './image-manifest.json' with { type: 'json' };
import { defaultLocale, isLocale } from '@/lib/i18n/config';

/**
 * Re-exported from the fixture, which is still where the project's shared
 * vocabulary lives. These are the same constants the database constrains its
 * columns to; components import them from here.
 */
export { WORK_STATUSES, WORK_CATEGORIES };

/* ------------------------------------------------------------------ *
 * Visibility
 *
 * Publication is a separate axis from sale status: a work whose published_at
 * is null is a draft, and the public site must never show it. A draft may hold
 * any of the four sale statuses, so status tells you nothing about visibility.
 *
 * This is deliberately NOT a filter that a query can quietly omit. Every read
 * below names its scope, and buildWhere throws if one does not — so a new
 * function cannot default into showing drafts by forgetting a line.
 * ------------------------------------------------------------------ */

const SCOPE = Object.freeze({
  /** Everything a visitor may see. Published works only. */
  PUBLIC: 'public',
  /** Everything that exists, drafts included. Admin lookups only. */
  ADMIN: 'admin',
});

function visibilityCondition(scope) {
  if (scope === SCOPE.PUBLIC) return 'published_at is not null';
  if (scope === SCOPE.ADMIN) return 'true';

  throw new Error(
    'A works query must state its visibility scope explicitly: SCOPE.PUBLIC ' +
      'for anything a visitor can reach, SCOPE.ADMIN for admin lookups. ' +
      'Received: ' + JSON.stringify(scope)
  );
}

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

/**
 * The column list every read shares.
 *
 * Three casts are load-bearing, because the driver's natural JavaScript types
 * would change the shape callers already depend on:
 *
 *   - `id::text` keeps the id a string, as it has always been. It is now a
 *     uuid rather than a slug, and it is meaningless outside the database.
 *   - `width_cm` / `height_cm` come back from `numeric` as *strings* ("999.0"),
 *     which would render as "999.0 x 999.0 cm" instead of "999 x 999 cm".
 *     float8 gives a real number.
 *   - `added_at::text` keeps the date the 'YYYY-MM-DD' string it was. Letting
 *     the driver build a Date would also drag the machine's timezone into it
 *     and could shift the day.
 */
const WORK_COLUMNS = `
  id::text                as id,
  slug_he, slug_en,
  title_he, title_en,
  description_he, description_en,
  medium,
  width_cm::float8        as width_cm,
  height_cm::float8       as height_cm,
  price_agorot,
  price_currency,
  year,
  category,
  status,
  featured,
  has_placeholder_data,
  added_at::text          as added_at
`;

/**
 * Newest first, ties broken by the English slug.
 *
 * This reproduces the file-backed `byMostRecent` exactly. That compared
 * `addedAt` descending and broke ties on the record's id — and in the fixture
 * the id *is* the English slug. The database id is a uuid, so ordering on it
 * would silently produce a different order; `slug_en` is the column that means
 * what the old id meant.
 */
const MOST_RECENT = 'order by added_at desc, slug_en asc';

/**
 * Agorot to whole currency units.
 *
 * THE ONLY PLACE THIS CONVERSION HAPPENS. The database stores money as a whole
 * number of minor units; `lib/format.js` renders `price.amount` with
 * maximumFractionDigits: 0, i.e. as whole shekels. Divide anywhere else as well
 * and the two sites will disagree; divide nowhere and a 999-shekel painting is
 * offered at 99,900.
 */
function toMajorUnits(agorot) {
  return agorot / 100;
}

/**
 * The pixel dimensions of one image file.
 *
 * Read from the generated manifest and from nothing else. `work_images` also
 * carries pixel_width / pixel_height, but while public/paintings exists the
 * manifest is the authoritative source: it is re-read from the actual files on
 * every build by scripts/generate-image-manifest.mjs and so cannot disagree
 * with them, whereas the database's copy was written once by the seed. The
 * database columns take over when the files leave the repository and the
 * manifest has nothing left to parse. See .claude/rules/images.md.
 *
 * Keyed by the image reference's filename stem rather than by anything on the
 * work, because the manifest is keyed by what is on disk and image_ref is the
 * column that holds where the file is.
 */
function readPixelDimensions(imageRef) {
  const stem = imageRef.split('/').pop().replace(/\.[^.]+$/, '');
  const entry = imageManifest[stem];

  if (!entry) {
    throw new Error(
      'No image in the manifest for "' +
        stem +
        '" (image_ref "' +
        imageRef +
        '"). Add public/paintings/' +
        stem +
        '.jpg and re-run: npm run images:manifest'
    );
  }

  return { width: entry.width, height: entry.height };
}

/** One work_images row to the image shape callers already consume. */
function toImage(row) {
  const { width, height } = readPixelDimensions(row.image_ref);

  return {
    id: row.id,
    type: row.type,
    position: row.position,
    src: row.image_ref,
    width,
    height,
  };
}

/**
 * One works row plus its images to the work shape.
 *
 * @param {object} row
 * @param {object[]} imageRows - Already ordered by position.
 */
function toWork(row, imageRows) {
  return {
    id: row.id,
    slug: { he: row.slug_he, en: row.slug_en },
    title: { he: row.title_he, en: row.title_en },
    description: { he: row.description_he, en: row.description_en },

    /**
     * Medium is a closed key in the database — 'oil-on-canvas' or
     * 'pastel-on-paper' — and it is optional. Every existing work has none, so
     * both languages come back null and the component renders nothing, which
     * is the honest representation of a value nobody has recorded. Null is not
     * invented data and it is not the string "null".
     *
     * The non-null case is an unfinished seam, and deliberately visible rather
     * than hidden: the raw key is returned in both languages because
     * translating it needs entries in he.json and en.json that do not exist
     * yet, and that is a locale and component change rather than a repository
     * one. No current row can reach it. See .claude/rules/i18n.md.
     */
    medium: { he: row.medium, en: row.medium },

    dimensions: { width: row.width_cm, height: row.height_cm, unit: 'cm' },
    year: row.year,
    price: {
      amount: toMajorUnits(row.price_agorot),
      currency: row.price_currency,
    },
    category: row.category,
    status: row.status,
    featured: row.featured,
    addedAt: row.added_at,
    images: imageRows.map(toImage),
    hasPlaceholderData: row.has_placeholder_data,
  };
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * Fetches the images for a set of works in one query and groups them by work.
 *
 * Ordered by position, then id so that two images sharing a position still come
 * back in a stable order — work_images deliberately does not make position
 * unique. Position 0 is the main image, so the main one also stays first, and
 * `images.find(image => image.type === 'main')` keeps working exactly as it
 * does today.
 *
 * pixel_width and pixel_height are deliberately not selected: see
 * readPixelDimensions.
 */
async function fetchImagesByWorkId(ids) {
  if (ids.length === 0) return new Map();

  const { rows } = await getPool().query(
    `select id::text as id, work_id::text as work_id, image_ref, type, position
       from work_images
      where work_id::text = any($1::text[])
      order by work_id, position, id`,
    [ids]
  );

  const byWorkId = new Map(ids.map((id) => [id, []]));
  for (const row of rows) {
    byWorkId.get(row.work_id)?.push(row);
  }

  return byWorkId;
}

/**
 * The one place a list of works is read.
 *
 * @param {object} params
 * @param {string} params.scope - SCOPE.PUBLIC or SCOPE.ADMIN. Required.
 * @param {string} [params.category]
 * @param {string[]} [params.statuses]
 * @param {string[]} [params.excludeIds]
 * @param {number} [params.limit]
 */
async function selectWorks({ scope, category, statuses, excludeIds, limit }) {
  const conditions = [visibilityCondition(scope)];
  const values = [];

  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }

  if (statuses) {
    values.push(statuses);
    conditions.push(`status = any($${values.length}::text[])`);
  }

  if (excludeIds) {
    // Compared as text rather than cast to uuid, so that an id which is not a
    // uuid excludes nothing instead of raising a type error mid-request.
    values.push(excludeIds);
    conditions.push(`id::text <> all($${values.length}::text[])`);
  }

  let sql = `select ${WORK_COLUMNS} from works where ${conditions.join(' and ')} ${MOST_RECENT}`;

  if (typeof limit === 'number') {
    values.push(limit);
    sql += ` limit $${values.length}`;
  }

  const { rows } = await getPool().query(sql, values);
  const images = await fetchImagesByWorkId(rows.map((row) => row.id));

  return rows.map((row) => toWork(row, images.get(row.id) ?? []));
}

/** Reads a single work by an arbitrary condition, or null. */
async function selectOneWork(scope, condition, values) {
  const { rows } = await getPool().query(
    `select ${WORK_COLUMNS}
       from works
      where ${visibilityCondition(scope)} and ${condition}
      ${MOST_RECENT}
      limit 1`,
    values
  );

  if (rows.length === 0) return null;

  const images = await fetchImagesByWorkId([rows[0].id]);
  return toWork(rows[0], images.get(rows[0].id) ?? []);
}

/**
 * The slug column for a locale.
 *
 * A map rather than a built column name: a column name interpolated from a
 * caller's argument is a SQL injection, and the values here come from this
 * module rather than from a request. Per-language columns mean a third language
 * touches the schema anyway — see .claude/rules/i18n.md.
 */
const SLUG_COLUMN = Object.freeze({ he: 'slug_he', en: 'slug_en' });

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Every work on show, most recent first. Published works only.
 *
 * @param {object} [options]
 * @param {string} [options.category] - Restrict to one category.
 * @param {string[]} [options.statuses] - Restrict to these statuses.
 * @param {string[]} [options.excludeIds] - Drop these works from the result.
 * @returns {Promise<object[]>}
 */
export async function getAllWorks(options = {}) {
  const { category, statuses, excludeIds } = options;
  return selectWorks({ scope: SCOPE.PUBLIC, category, statuses, excludeIds });
}

/**
 * One work, addressed by its slug in a given language. Published works only,
 * so a draft is not reachable by guessing its URL.
 *
 * Each work has a separate slug per language, so the locale is part of the
 * lookup: /he/art/<hebrew-slug> and /en/art/lemons are the same painting.
 *
 * @returns {Promise<object|null>} null when nothing matches.
 */
export async function getWorkBySlug(slug, locale = defaultLocale) {
  if (!slug) return null;
  if (!isLocale(locale)) return null;

  const column = SLUG_COLUMN[locale];
  if (!column) return null;

  return selectOneWork(SCOPE.PUBLIC, `${column} = $1`, [decodeURIComponent(slug)]);
}

/**
 * One work, addressed by its slug in *any* language. Published works only.
 *
 * This is what lets the language switcher stay dumb. Switching language is a
 * plain swap of the first URL segment, so on an artwork page it produces the
 * other language's URL still carrying this language's slug. The artwork route
 * resolves that here and redirects to the canonical one, so the switcher never
 * needs to know that slugs are per-language.
 *
 * @returns {Promise<object|null>}
 */
export async function findWorkByAnySlug(slug) {
  if (!slug) return null;

  const decoded = decodeURIComponent(slug);
  return selectOneWork(SCOPE.PUBLIC, '(slug_he = $1 or slug_en = $1)', [decoded]);
}

/**
 * The most recently added works — what the homepage grid shows.
 *
 * @param {number} limit
 * @param {object} [options] - Same filters as getAllWorks.
 * @returns {Promise<object[]>}
 */
export async function getRecentWorks(limit = 12, options = {}) {
  const { category, statuses, excludeIds } = options;
  return selectWorks({ scope: SCOPE.PUBLIC, category, statuses, excludeIds, limit });
}

/**
 * One work by its stable id. Used by the admin area, where works are addressed
 * by id rather than by a language-specific slug.
 *
 * ADMIN scope: this is the one read that sees drafts, because the admin has to
 * be able to open a work it has not published yet.
 *
 * @returns {Promise<object|null>}
 */
export async function getWorkById(id) {
  if (!id) return null;

  // Compared as text so that an id which is not a uuid returns null — a 404 —
  // rather than raising a type error and a 500.
  return selectOneWork(SCOPE.ADMIN, 'id::text = $1', [id]);
}

/**
 * The work featured on the homepage hero.
 *
 * At most one row may carry `featured` — the database enforces it — and when
 * none does, this falls back to the most recent work, as it always has.
 *
 * @returns {Promise<object|null>}
 */
export async function getFeaturedWork() {
  const featured = await selectOneWork(SCOPE.PUBLIC, 'featured', []);
  if (featured) return featured;

  return selectOneWork(SCOPE.PUBLIC, 'true', []);
}

/**
 * Every (locale, slug) pair, for generateStaticParams on the artwork route.
 *
 * Published works only: a draft must not be pre-generated. The route allows
 * dynamic params, so a draft's URL is still attempted at request time, and both
 * slug lookups above are public-scoped — so it 404s rather than rendering.
 *
 * @returns {Promise<{locale: string, slug: string}[]>}
 */
export async function getAllWorkSlugs(locales) {
  const works = await selectWorks({ scope: SCOPE.PUBLIC });

  return locales.flatMap((locale) =>
    works.map((work) => ({ locale, slug: work.slug[locale] }))
  );
}

/**
 * The slug of one work in every language, so the language switcher can move
 * between the two URLs instead of producing a dead one.
 *
 * PUBLIC scope: its purpose is the hreflang pair, and hreflang must not point
 * at a draft.
 *
 * @returns {Promise<Record<string, string>|null>}
 */
export async function getSlugsForWork(id) {
  if (!id) return null;

  const { rows } = await getPool().query(
    `select slug_he, slug_en
       from works
      where ${visibilityCondition(SCOPE.PUBLIC)} and id::text = $1
      limit 1`,
    [id]
  );

  if (rows.length === 0) return null;
  return { he: rows[0].slug_he, en: rows[0].slug_en };
}
