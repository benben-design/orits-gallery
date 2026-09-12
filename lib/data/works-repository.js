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
import { unstable_cache } from 'next/cache';
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
  price_reduced_agorot,
  price_currency,
  year,
  category,
  status,
  sale_channel,
  featured,
  has_placeholder_data,
  published_at::text      as published_at,
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
 * The orderings a read may ask for, by name.
 *
 * A **key**, never a clause, is what callers pass — the same precaution as
 * `SLUG_COLUMN` below, and for the same reason: this text is interpolated into
 * SQL, so it may never be built from anything a caller supplies. Adding an
 * ordering means adding it here.
 */
const ORDER = Object.freeze({
  /** Newest first. What every public surface uses. */
  mostRecent: MOST_RECENT,

  /**
   * Drafts first, newest first within each group.
   *
   * For the admin's list, where a draft is unfinished business rather than an
   * old record: ordered by date alone, the work she has just started sits
   * wherever its date puts it, which on a catalogue of thirty is out of sight.
   * `published_at is null` sorts true first under `desc`.
   */
  draftsFirst: 'order by (published_at is null) desc, added_at desc, slug_en asc',
});

function orderingClause(order) {
  const clause = ORDER[order];
  if (clause) return clause;

  throw new Error(
    'Unknown ordering: ' + JSON.stringify(order) + '. Use one of: ' +
      Object.keys(ORDER).join(', ')
  );
}

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
 * Whether a stored image reference points inside this repository.
 *
 * The shape of the value is the whole test: a local path under
 * public/paintings begins with a slash — '/paintings/lemons.jpg' — and a
 * hosted identifier does not — 'orit/works/lemons'. That is also why
 * image_ref carries no check constraint on its shape in the schema: both
 * kinds are legal values in that column, and both will be in the table at
 * once while images are moving.
 */
function isLocalImageRef(imageRef) {
  return imageRef.startsWith('/');
}

/**
 * The pixel dimensions of one image file.
 *
 * A decision per image, not a rule for the whole site. Which source is right
 * depends on where the file actually is, and image_ref is what says:
 *
 *   - **Local.** The generated manifest wins. It is re-read from the files on
 *     disk on every build by scripts/generate-image-manifest.mjs and so cannot
 *     disagree with them, whereas work_images.pixel_width / pixel_height are a
 *     copy the seed wrote once.
 *   - **Anywhere else.** Those columns are the only source there is. The
 *     manifest script parses public/paintings and nothing else, so a hosted
 *     file has no entry in it and never will.
 *
 * Reading the manifest for every image was the rule until now, and it was a
 * trap rather than a simplification: the first image stored outside the
 * repository would have thrown here on every read of its work — taking the
 * works list, the gallery and the homepage down together, and telling whoever
 * found it to add a file to public/paintings that was never meant to be there.
 *
 * See .claude/rules/images.md.
 */
function readPixelDimensions(row) {
  if (isLocalImageRef(row.image_ref)) {
    /**
     * Keyed by the filename stem, because the manifest is keyed by what is on
     * disk and image_ref is the column that holds where the file is.
     *
     * A local reference with no entry still throws, exactly as it did before.
     * It means the file is not in public/paintings, so the image would 404
     * whatever dimensions were returned for it, and prebuild regenerates the
     * manifest from disk — this is a repository to fix, not a data condition
     * to degrade around.
     */
    const stem = row.image_ref.split('/').pop().replace(/\.[^.]+$/, '');
    const entry = imageManifest[stem];

    if (!entry) {
      throw new Error(
        'No image in the manifest for "' +
          stem +
          '" (image_ref "' +
          row.image_ref +
          '"). Add public/paintings/' +
          stem +
          '.jpg and re-run: npm run images:manifest'
      );
    }

    return { width: entry.width, height: entry.height };
  }

  /**
   * Not a fallback for a missing manifest entry — the authoritative source for
   * this kind of reference. Both columns are `not null` in the schema, so the
   * only way they arrive empty is a query that stopped selecting them, which
   * is a mistake in this module rather than a state the data can be in. Worth
   * saying out loud because the alternative is undefined reaching next/image
   * and a layout that is quietly wrong.
   */
  if (!row.pixel_width || !row.pixel_height) {
    throw new Error(
      'No pixel dimensions on the work_images row for image_ref "' +
        row.image_ref +
        '". A reference outside the repository resolves from pixel_width and ' +
        'pixel_height, so the images query has to select them.'
    );
  }

  return { width: row.pixel_width, height: row.pixel_height };
}

/** One work_images row to the image shape callers already consume. */
function toImage(row) {
  const { width, height } = readPixelDimensions(row);

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
     * The key is returned raw in both languages because medium is not
     * bilingual content: it is a closed set translated in the application like
     * any other piece of UI text. Both keys now have entries in he.json and
     * en.json, and `components/ui/mediumLabel.js` is the one place that turns
     * a key into words — the repository does not know about dictionaries and
     * should not start. See .claude/rules/i18n.md.
     */
    medium: { he: row.medium, en: row.medium },

    dimensions: { width: row.width_cm, height: row.height_cm, unit: 'cm' },
    year: row.year,
    price: {
      amount: toMajorUnits(row.price_agorot),

      /**
       * The discounted price, or null when there is no discount.
       *
       * Read for the same reason `saleChannel` is: the admin's edit form has a
       * field for it, and a form that cannot see a stored value overwrites it
       * with blank the first time anything else on the record is saved. A
       * discount silently disappearing when the artist fixes a typo in a title
       * is exactly the kind of loss nobody notices until a buyer is charged
       * full price.
       *
       * A discounted work is **still `available`** — this is a price, never a
       * status. How it should be *presented* on the public site has not been
       * decided, and reading it here does not decide it. See commerce.md.
       */
      reducedAmount:
        row.price_reduced_agorot === null
          ? null
          : toMajorUnits(row.price_reduced_agorot),

      currency: row.price_currency,
    },
    category: row.category,
    status: row.status,

    /**
     * Which channel the work sold through — `this-site`, `under1000` or
     * `elsewhere` — or null when it has not sold, or sold before anyone
     * recorded where.
     *
     * **Admin-facing only. Nothing on the public site may render it.** A
     * visitor has no use for the fact that a painting went on another
     * platform, and printing it turns the artist's sales channels into
     * public information. It travels beside `status` because that is the
     * question it completes — status says a work is sold, this says where —
     * and the admin is where both are acted on.
     *
     * It is not a second status and it does not affect visibility. A work can
     * carry a channel and any of the four statuses, and publication remains a
     * separate axis again. See commerce.md.
     */
    saleChannel: row.sale_channel,

    featured: row.featured,
    addedAt: row.added_at,

    /**
     * When this went live, or null for a draft. Publication is a separate
     * axis from sale status, so this is the only field that answers "is it
     * on the public site" — a status of `sold` says nothing about it.
     *
     * Every public read already filters on it, so on a work returned by one
     * of those it is always non-null. It is here for the admin, which sees
     * both kinds and has to tell them apart.
     */
    publishedAt: row.published_at,
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
 * pixel_width and pixel_height are selected because an image stored outside
 * the repository has no other source for them — see readPixelDimensions. A
 * local reference still resolves from the manifest and ignores these two
 * columns, so on today's sixteen works they are read and discarded. They were
 * deliberately left out until now, and leaving them out is what made the
 * hosted case impossible to serve.
 */
async function fetchImagesByWorkId(ids) {
  if (ids.length === 0) return new Map();

  const { rows } = await getPool().query(
    `select id::text as id, work_id::text as work_id, image_ref, type, position,
            pixel_width, pixel_height
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
 * @param {string[]} [params.ids] - Restrict to these works.
 * @param {string[]} [params.excludeIds]
 * @param {number} [params.limit]
 * @param {string} [params.order] - A key of ORDER. Defaults to most recent.
 */
async function selectWorks({
  scope,
  category,
  statuses,
  ids,
  excludeIds,
  limit,
  order = 'mostRecent',
}) {
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

  if (ids) {
    // Text, for the same reason as excludeIds below: a cart cookie can be
    // edited by hand, and an id that is not a uuid must match nothing rather
    // than raise a type error and take the page down with it.
    values.push(ids);
    conditions.push(`id::text = any($${values.length}::text[])`);
  }

  if (excludeIds) {
    // Compared as text rather than cast to uuid, so that an id which is not a
    // uuid excludes nothing instead of raising a type error mid-request.
    values.push(excludeIds);
    conditions.push(`id::text <> all($${values.length}::text[])`);
  }

  let sql = `select ${WORK_COLUMNS} from works where ${conditions.join(' and ')} ${orderingClause(order)}`;

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
 * The tag every cached read here carries, and the one thing that clears them.
 *
 * It is a single tag rather than one per query deliberately: the question any
 * write here asks is "has the catalogue changed", never "has the landscape
 * filter changed", and a set of narrow tags is a set of chances to forget one.
 *
 * Invalidated through `revalidatePublicSite()` in lib/revalidate.js, which is
 * the only thing that should ever name it. See that file for why the tag and
 * the path invalidation travel together.
 */
export const WORKS_CACHE_TAG = 'works';

/**
 * The gallery's catalogue read, cached.
 *
 * **This exists because the gallery cannot be a static page and the database
 * read behind it still should not happen per request.** The page reads
 * `searchParams` for the category filter, which makes it render per request
 * whatever revalidation window is declared on it — so a window on the page
 * would be inert, and the win has to be taken at the data instead. Categories
 * staying a filter rather than becoming separate routes is a settled decision;
 * this is what pays for that decision rather than routing around it.
 *
 * **It is deliberately not `getAllWorks` with a cache on it**, and that is the
 * trap worth knowing about. Two other callers share that function:
 * `app/api/health/route.js` calls it *because* a real query proves the database
 * is reachable from a handler, and a cached liveness check is a liveness check
 * that reports success while the database is down. `app/sitemap.js` calls it
 * too. Caching the shared function would have taken both with it, silently.
 *
 * The window is one hour, and it is a backstop rather than the mechanism: the
 * admin's actions and the payment return both invalidate the tag as they write,
 * so the artist's edits and a painting selling appear at once. The hour is what
 * catches anything that changed the database without going through either.
 *
 * `category` is a plain string or null rather than the options object the
 * uncached read takes, because the argument is part of the cache key and a key
 * built from an object is a key that changes shape when a caller adds a field.
 *
 * @param {string|null} category - One of WORK_CATEGORIES, or null for all.
 * @returns {Promise<object[]>}
 */
export const getGalleryWorks = unstable_cache(
  async (category) =>
    selectWorks({ scope: SCOPE.PUBLIC, category: category ?? undefined }),
  ['gallery-works'],
  { tags: [WORKS_CACHE_TAG], revalidate: 3600 }
);

/**
 * The works named by a list of ids. Published works only.
 *
 * **What the cart is built on**, and public-scoped for the reason that makes
 * the cart honest: a cart holds ids and re-reads everything else, so this is
 * where a painting that has since been unpublished stops resolving. The cart
 * page reports that rather than showing a work a visitor can no longer have.
 * See commerce.md on the double-sale problem — a cart is a wish, not a hold.
 *
 * Two properties callers depend on:
 *
 *   - **An id that matches nothing is simply absent from the result.** There
 *     is no error and no placeholder. The caller compares what it asked for
 *     with what came back; that difference is the answer to "what has gone".
 *   - **The order is the repository's, not the caller's.** Ids arrive from a
 *     cookie in the order they were added, and a cart should read in that
 *     order — so the caller re-orders. Insertion order is a fact about a cart,
 *     not about the catalogue, and it does not belong in a `order by`.
 *
 * An empty list short-circuits rather than issuing `= any('{}')`.
 *
 * @param {string[]} ids
 * @returns {Promise<object[]>}
 */
export async function getWorksByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  return selectWorks({ scope: SCOPE.PUBLIC, ids });
}

/**
 * Every work that exists, drafts included, drafts first.
 *
 * **The only multi-work read that is not public-scoped, and the reason it had
 * to be written rather than borrowed.** Every other list here filters on
 * publication, which is what makes a draft invisible to the gallery, the
 * homepage grid, the sitemap and the hreflang pairs by construction. The admin
 * needs the opposite — she cannot get back to a painting she has just created
 * if the only way to list works hides it — so this asks for `SCOPE.ADMIN`
 * explicitly and **nothing else changes**. Widening one of the public reads to
 * serve this would have published every draft on the site in one line.
 *
 * The ordering is the second half of the point. A draft is unfinished business,
 * so it sorts to the top rather than to wherever its date happens to put it.
 *
 * Nothing calls this but the admin's works list. If a second caller appears,
 * check that it is an admin surface before you hand it drafts.
 *
 * @returns {Promise<object[]>}
 */
export async function getWorksForAdmin() {
  return selectWorks({ scope: SCOPE.ADMIN, order: 'draftsFirst' });
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

/* ------------------------------------------------------------------ *
 * Writing
 *
 * The first writes in this module. Two rules carry over from the reads and one
 * is new:
 *
 *   - still async, still plain objects out;
 *   - still the only module that talks to the database;
 *   - and money still converts in exactly one place. `toMajorUnits` handles the
 *     way out; the way in is handled by validateWorkInput, which hands this
 *     function agorot already. Nothing here multiplies by 100, and nothing
 *     here should start to.
 *
 * These do not check who is calling. Authorisation belongs to the caller —
 * every admin mutation verifies the session itself, see security.md — because
 * a repository that quietly enforced it would be doing two jobs and would be
 * the wrong place to look for either.
 * ------------------------------------------------------------------ */

/**
 * The error a caller gets when a slug is already taken.
 *
 * A distinguishable type rather than a raw driver error, so the admin can say
 * "that name is already used" in Hebrew instead of showing a constraint name.
 * Which slug collided is carried on the error, because with two languages the
 * artist needs to know which box to change.
 */
export class DuplicateSlugError extends Error {
  constructor(field) {
    super('A work already exists with this slug: ' + field);
    this.name = 'DuplicateSlugError';
    this.field = field;
  }
}

/** Postgres's unique-violation code. */
const UNIQUE_VIOLATION = '23505';

/**
 * Writes a work's main image, on a caller's transaction.
 *
 * Takes the client rather than the pool because **both** writers that use it
 * have something else to commit alongside: `createWork` inserts the work in the
 * same transaction, `setMainImage` deletes the row it is replacing. Neither may
 * half-succeed, and a helper that opened its own connection could not promise
 * that.
 *
 * Position 0, because reads order by position and the main image is first. Alt
 * text is deliberately not set: null means the application derives it from the
 * work's title, and a default here would be a Hebrew or English phrase living
 * in the database. See .claude/rules/images.md.
 *
 * @param {object} client - An open `pg` client inside a transaction.
 * @param {string} workId - The database's own uuid, not a value from a caller.
 * @param {{ref: string, width: number, height: number}} image - Read back from
 *   the image host, never reported by a browser.
 */
function insertMainImage(client, workId, image) {
  return client.query(
    `insert into work_images (
       work_id, image_ref, pixel_width, pixel_height, type, position
     ) values ($1, $2, $3, $4, 'main', 0)
     returning id::text as id, image_ref, type, position,
               pixel_width, pixel_height`,
    [workId, image.ref, image.width, image.height]
  );
}

/**
 * Creates a work.
 *
 * @param {object} input - Already validated by validateWorkInput. This function
 *   trusts the shape and the closed sets; it does not re-check them, because
 *   two validators drift and the database constrains the same values anyway.
 * @param {{ref: string, width: number, height: number}|null} [image] - A main
 *   image to attach in the same breath, when the artist chose a photograph
 *   while creating the work. Read back from the image host by
 *   `lib/image-host.js` — never numbers a browser reported.
 * @returns {Promise<object>} The created work, in the same shape every read
 *   returns — so the caller can render it without a second query.
 * @throws {DuplicateSlugError} When either slug is already in use.
 *
 * **The work and its photograph land together or not at all.** Both inserts are
 * one transaction, because the alternative fails in the worst available way: a
 * work saved whose image insert then failed is a painting she was told was
 * created, sitting in the list with an empty frame, with nothing to tell her
 * the photograph she watched upload was dropped. Two separate writes cannot
 * promise that; one transaction can.
 */
export async function createWork(input, image = null) {
  const {
    slugHe, slugEn, titleHe, titleEn,
    descriptionHe, descriptionEn, medium,
    widthCm, heightCm,
    priceAgorot, priceReducedAgorot,
    year, category, status, saleChannel,
    addedAt, hasPlaceholderData, publish,
  } = input;

  const client = await getPool().connect();

  try {
    await client.query('begin');

    const { rows } = await client.query(
      `insert into works (
         slug_he, slug_en, title_he, title_en,
         description_he, description_en, medium,
         width_cm, height_cm,
         price_agorot, price_reduced_agorot,
         year, category, status, sale_channel,
         published_at, has_placeholder_data, added_at
       ) values (
         $1, $2, $3, $4,
         $5, $6, $7,
         $8, $9,
         $10, $11,
         $12, $13, $14, $15,
         ${/* Publication is a timestamp, not a boolean: null is a draft, and
              now() records when it actually went live. */ ''}
         case when $16 then now() else null end, $17, $18
       )
       returning ${WORK_COLUMNS}`,
      [
        slugHe, slugEn, titleHe, titleEn,
        descriptionHe, descriptionEn, medium,
        widthCm, heightCm,
        priceAgorot, priceReducedAgorot,
        year, category, status, saleChannel,
        publish, hasPlaceholderData, addedAt,
      ]
    );

    /**
     * A work created without a photograph has no images, which is still an
     * ordinary state — she can attach one on the edit page afterwards, and a
     * draft is allowed to have none at all.
     */
    const imageRows = image
      ? (await insertMainImage(client, rows[0].id, image)).rows
      : [];

    await client.query('commit');

    return toWork(rows[0], imageRows);
  } catch (error) {
    await client.query('rollback');

    if (error.code === UNIQUE_VIOLATION) {
      // The index names tell us which language collided. Both slugs are
      // unique separately, so only one of these can be the cause.
      const field = String(error.constraint ?? '').includes('slug_he')
        ? 'slugHe'
        : 'slugEn';
      throw new DuplicateSlugError(field);
    }

    throw error;
  } finally {
    // Always, or the pool leaks a connection per rejected slug and the site
    // stops answering after ten of them.
    client.release();
  }
}

/**
 * Updates a work.
 *
 * Takes the same validated shape as `createWork`, plus the id of the row to
 * change, and returns the updated work — so the caller can render it without a
 * second query.
 *
 * Three things here are specific to editing rather than creating:
 *
 * **Publication does not reset.** `publish` toggles whether the work is public,
 * but re-publishing something that was live before keeps the date it originally
 * went live: `coalesce(published_at, now())` only fills a null. Overwriting it
 * would quietly rewrite the work's history every time she toggled it, and
 * "when did this go live" is the entire reason the column is a timestamp rather
 * than a boolean. Unpublishing sets it back to null, which is what puts a work
 * away without deleting it.
 *
 * **`created_at` is untouched and `updated_at` is set here.** The table has no
 * trigger, deliberately — see migration 001 — so the application is what moves
 * it, and this is the one place that happens for a work.
 *
 * **Slugs are accepted as given.** Refusing to change a published work's slug is
 * a rule about what the admin may offer, not about what the database can store,
 * and it is enforced in the action where the current publication state is
 * already known. A repository that silently ignored part of its own input would
 * be worse: the caller would have no way to tell that it had.
 *
 * @param {string} id - The work's uuid.
 * @param {object} input - Already validated by validateWorkInput.
 * @returns {Promise<object|null>} The updated work, or null if no row has that id.
 * @throws {DuplicateSlugError} When either slug is already used by another work.
 */
export async function updateWork(id, input) {
  const {
    slugHe, slugEn, titleHe, titleEn,
    descriptionHe, descriptionEn, medium,
    widthCm, heightCm,
    priceAgorot, priceReducedAgorot,
    year, category, status, saleChannel,
    addedAt, hasPlaceholderData, publish,
  } = input;

  try {
    const { rows } = await getPool().query(
      `update works set
         slug_he = $2, slug_en = $3,
         title_he = $4, title_en = $5,
         description_he = $6, description_en = $7,
         medium = $8,
         width_cm = $9, height_cm = $10,
         price_agorot = $11, price_reduced_agorot = $12,
         year = $13, category = $14, status = $15, sale_channel = $16,
         published_at = case when $17 then coalesce(published_at, now()) else null end,
         has_placeholder_data = $18,
         added_at = $19,
         updated_at = now()
       where id::text = $1
       returning ${WORK_COLUMNS}`,
      [
        id,
        slugHe, slugEn, titleHe, titleEn,
        descriptionHe, descriptionEn, medium,
        widthCm, heightCm,
        priceAgorot, priceReducedAgorot,
        year, category, status, saleChannel,
        publish, hasPlaceholderData, addedAt,
      ]
    );

    if (rows.length === 0) return null;

    const images = await fetchImagesByWorkId([rows[0].id]);
    return toWork(rows[0], images.get(rows[0].id) ?? []);
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const field = String(error.constraint ?? '').includes('slug_he')
        ? 'slugHe'
        : 'slugEn';
      throw new DuplicateSlugError(field);
    }

    throw error;
  }
}

/**
 * The error a caller gets when a work cannot be deleted because it was bought.
 *
 * `order_lines.work_id` is `on delete restrict`, so the database refuses and
 * this turns that refusal into something the admin can say in Hebrew. A raw
 * foreign-key error reaching the artist is a phone call to her son — see
 * database.md, which asks for exactly this.
 *
 * **This is the whole of the protection, and it is deliberate.** No order rows
 * exist yet, so nothing exercises it today; the temptation is to read the
 * orders table first and refuse politely. That would be a check-then-act race
 * and a second place the rule lives. The constraint is already in the schema
 * and cannot be forgotten, so the cheapest correct settlement is to let it fire
 * and translate it here.
 */
export class WorkHasOrdersError extends Error {
  constructor() {
    super('This work belongs to an order and cannot be deleted');
    this.name = 'WorkHasOrdersError';
  }
}

/** Postgres's foreign-key-violation code. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Deletes a work, permanently.
 *
 * **Its images go with it and nothing here says so.** `work_images.work_id` is
 * `on delete cascade`, so the rows are removed by the database in the same
 * statement. Deleting them first would be a second place that has to be kept
 * in step with the schema, and the first thing to be forgotten when a third
 * child table appears.
 *
 * @param {string} id
 * @returns {Promise<boolean>} False when no work has that id.
 * @throws {WorkHasOrdersError} When the work appears on an order.
 */
export async function deleteWork(id) {
  if (!id) return false;

  try {
    // Compared as text, like every other lookup here, so a malformed id deletes
    // nothing instead of raising a type error.
    const { rowCount } = await getPool().query(
      'delete from works where id::text = $1',
      [id]
    );

    return rowCount > 0;
  } catch (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) throw new WorkHasOrdersError();
    throw error;
  }
}

/**
 * Takes a work off the public site without deleting anything.
 *
 * The same state unticking "published" in the edit form produces, and the same
 * one meaning of unpublished: `published_at` back to null. It exists as its own
 * write because it is what the delete confirmation offers instead of deleting,
 * and routing that through `updateWork` would mean re-validating an entire
 * record to change one column.
 *
 * The limit data-layer.md records applies here too: unpublishing destroys the
 * original publication date, so a work taken down and put back gets a new one.
 *
 * @param {string} id
 * @returns {Promise<boolean>} False when no work has that id.
 */
export async function unpublishWork(id) {
  if (!id) return false;

  const { rowCount } = await getPool().query(
    `update works
        set published_at = null,
            updated_at = now()
      where id::text = $1`,
    [id]
  );

  return rowCount > 0;
}

/**
 * Records that a painting sold, and where.
 *
 * **This exists so that marking a work sold does not go through `updateWork`.**
 * That path validates an entire record, and the admin form on top of it refuses
 * to save while any machine translation is unapproved — so marking a painting
 * sold could fail because an English description generated a fortnight ago was
 * never read. A one-column fact about money, blocked by a field she never
 * touched, at the moment the site is still offering a painting that is gone.
 * Two columns move here and nothing else is looked at.
 *
 * **`this-site` is excluded in the `where` clause rather than checked first.**
 * That channel means an order exists; overwriting it by hand would leave the
 * catalogue contradicting the orders table. Excluding it in SQL rather than
 * reading the row and deciding closes the window between the two — the same
 * reason `deleteWork` catches the foreign-key violation instead of counting
 * order lines first.
 *
 * Publication is untouched: a work can sell while it is still a draft, and
 * selling one is not a reason to put it on the site or take it off.
 *
 * @param {string} id
 * @param {string} channel - One of `MANUAL_SALE_CHANNELS`. Validated by the
 *   caller; never `this-site`, which only checkout writes.
 * @returns {Promise<boolean>} False when no work has that id, or when the work
 *   sold through this site.
 */
export async function markWorkSold(id, channel) {
  if (!id || !channel) return false;

  const { rowCount } = await getPool().query(
    `update works
        set status = 'sold',
            sale_channel = $2,
            updated_at = now()
      where id::text = $1
        and sale_channel is distinct from 'this-site'`,
    [id, channel]
  );

  return rowCount > 0;
}

/**
 * Puts a painting back on sale after it was marked sold by hand.
 *
 * **It clears the channel in the same statement, and that is the point rather
 * than tidiness.** A work that is `available` while still recording where it
 * sold is a contradiction nothing in the schema forbids and nothing in the site
 * would complain about — and a stale channel read six months later is read as
 * true. The status and the channel are one fact, so they move together in both
 * directions.
 *
 * It returns the work to `available` rather than to whatever it held before.
 * The previous status is not recorded anywhere, and inventing `reserved` or
 * `not-for-sale` back would be a guess about a state that governs whether a
 * stranger can buy the painting. `available` is the state the artist can see
 * and correct in one edit; the others she would have to notice first.
 *
 * **`this-site` is excluded here for a stronger reason than above.** Undoing a
 * hand-marked sale corrects a click. Undoing a sale that went through this site
 * asserts that money went back, against an order row that says it did not — and
 * commerce.md is explicit that nothing which later happens to the catalogue may
 * change what an order says. It is refused, and the admin says so rather than
 * silently doing nothing.
 *
 * @param {string} id
 * @returns {Promise<boolean>} False when no work has that id, or when the work
 *   sold through this site.
 */
export async function returnWorkToSale(id) {
  if (!id) return false;

  const { rowCount } = await getPool().query(
    `update works
        set status = 'available',
            sale_channel = null,
            updated_at = now()
      where id::text = $1
        and sale_channel is distinct from 'this-site'`,
    [id]
  );

  return rowCount > 0;
}

/**
 * Attaches or replaces a work's main image.
 *
 * @param {string} workId
 * @param {{ref: string, width: number, height: number}} image - Read back from
 *   the image host by `lib/image-host.js`, never reported by the browser.
 * @returns {Promise<object|null>} The stored image in the shape reads return,
 *   or null when no work has that id.
 *
 * **One statement pair in one transaction, because the database allows one main
 * image per work and no more.** `work_images_one_main` is a partial unique
 * index, so inserting the new row before removing the old one fails; doing the
 * two outside a transaction leaves a window in which the work has no image at
 * all, and if the insert then failed it would stay that way. The delete and the
 * insert are the same change and they commit together.
 *
 * **The previous file is left on the host.** Only the row is replaced. Deleting
 * remotely from a save path means a save that half-succeeded — the row gone and
 * the file gone with it, or the file gone and the row still pointing at it —
 * and it makes the undo for a mistaken upload a support call rather than a
 * re-upload. At thirty paintings the abandoned originals are not a storage
 * problem worth buying that risk to solve.
 *
 * Position 0, because reads order by position and the main image is first.
 * Alt text is deliberately not set: null means the application derives it from
 * the work's title in that language, and a default here would be a Hebrew or
 * English phrase living in the database. See .claude/rules/images.md.
 */
export async function setMainImage(workId, image) {
  if (!workId) return null;

  const client = await getPool().connect();

  try {
    await client.query('begin');

    // Compared as text like every other lookup here, so a malformed id changes
    // nothing rather than raising a type error mid-transaction.
    const { rows: works } = await client.query(
      'select id from works where id::text = $1',
      [workId]
    );

    if (works.length === 0) {
      await client.query('rollback');
      return null;
    }

    await client.query(
      `delete from work_images where work_id = $1 and type = 'main'`,
      [works[0].id]
    );

    const { rows } = await insertMainImage(client, works[0].id, image);

    await client.query('commit');

    // Through toImage, so what comes back is the same shape every read
    // produces — including resolving the dimensions the way a read would.
    return toImage(rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    // Always, or the pool leaks a connection per failed upload and the site
    // stops answering after ten of them.
    client.release();
  }
}
