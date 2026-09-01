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
 * Creates a work.
 *
 * @param {object} input - Already validated by validateWorkInput. This function
 *   trusts the shape and the closed sets; it does not re-check them, because
 *   two validators drift and the database constrains the same values anyway.
 * @returns {Promise<object>} The created work, in the same shape every read
 *   returns — so the caller can render it without a second query.
 * @throws {DuplicateSlugError} When either slug is already in use.
 */
export async function createWork(input) {
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

    // A work has no images until one is attached, which is the normal state of
    // a record the artist has just created.
    return toWork(rows[0], []);
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // The index names tell us which language collided. Both slugs are
      // unique separately, so only one of these can be the cause.
      const field = String(error.constraint ?? '').includes('slug_he')
        ? 'slugHe'
        : 'slugEn';
      throw new DuplicateSlugError(field);
    }

    throw error;
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
