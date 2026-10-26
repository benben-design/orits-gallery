/**
 * ============================================================================
 * LOCAL DEVELOPMENT ONLY. THIS MUST NEVER RUN AGAINST PRODUCTION.
 * ============================================================================
 *
 * Fills a local Postgres with the sixteen works that currently live in
 * lib/data/artworks.js, plus their existing images.
 *
 * The data it writes is not production data and is not meant to become
 * production data. Titles, slugs, categories and statuses are real; the
 * dimensions, prices, years and descriptions are the deliberately absurd
 * stand-ins from the data file — 999 x 999 cm, 99,999 shekels, the year 1000,
 * copy prefixed [PLACEHOLDER] and [טקסט זמני] — carried over exactly as they
 * are so that they stay obviously fake. Nothing here is tidied into
 * plausible-looking values, because the whole point of those numbers is that
 * they cannot ship unnoticed.
 *
 * This file deliberately sits in scripts/ rather than database/migrations/, and
 * deliberately has no sequence number. It is not part of the schema history and
 * must never be applied in the migration order — a numbered file in that folder
 * reads as something production is expected to have run.
 *
 * It refuses to do anything at all unless DATABASE_URL points at localhost.
 * See the guard below; that check runs before any connection is opened.
 *
 * Safe to run repeatedly. Works are matched by their English slug and updated
 * in place, and a work's images are replaced rather than appended, so a second
 * run resets the database to the seed state instead of duplicating it.
 *
 * Usage:
 *   npm run seed:local
 */

import { getPool } from '../lib/db.js';

/* ------------------------------------------------------------------ *
 * The local-only guard
 *
 * Runs before anything connects. Any host that is not loopback is refused,
 * which covers Neon, any staging box and anything reached through a tunnel.
 * An allowlist rather than a blocklist on purpose: a blocklist of hostnames to
 * avoid is a list someone forgets to add to, and the failure mode is seeding
 * fake prices over real ones.
 * ------------------------------------------------------------------ */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function refuse(reason) {
  console.error('\nRefusing to seed.\n');
  console.error(reason);
  console.error(
    '\nThis script writes placeholder data and is for a local database only.\n'
  );
  process.exit(1);
}

function assertLocalDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    refuse(
      'DATABASE_URL is not set, so there is nothing to check and nothing to seed.\n' +
        'Copy .env.example to .env.local and point it at your local Postgres.'
    );
  }

  /**
   * Also refuse on the markers of a deployed environment, before even looking
   * at the host. A correct hostname in the wrong place is still the wrong
   * place, and a build host sets these on every build and every function.
   *
   * **Every platform the project might run on has to be named here**, because
   * the failure mode of missing one is silent: an unrecognised host sets none
   * of the variables this looks for, so the check simply passes and the next
   * line of defence is the hostname allowlist alone. That is what nearly
   * happened when hosting moved from Vercel to Netlify — `VERCEL` does not
   * exist on Netlify, so this guard would have gone quiet with nothing to say
   * it had. Both are listed, and Vercel stays listed: a guard that costs one
   * comparison is not worth pruning for tidiness.
   *
   * What is behind it: this script writes deliberately absurd placeholder
   * prices over whatever it is pointed at.
   */
  if (process.env.NODE_ENV === 'production') {
    refuse('NODE_ENV is "production".');
  }
  if (process.env.NETLIFY || process.env.NETLIFY_LOCAL) {
    refuse('This is running on Netlify (NETLIFY is set in the environment).');
  }
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    refuse('This is running on Vercel (VERCEL is set in the environment).');
  }

  let hostname;
  try {
    // Strip the brackets the URL parser puts around an IPv6 host, so that
    // [::1] matches the allowlist entry ::1.
    hostname = new URL(connectionString).hostname.replace(/^\[|\]$/g, '');
  } catch {
    refuse(
      'DATABASE_URL could not be parsed as a URL, so its host cannot be\n' +
        'verified as local. Expected postgresql://user:password@host:port/database'
    );
  }

  if (!LOCAL_HOSTNAMES.has(hostname)) {
    refuse(
      'DATABASE_URL points at "' +
        hostname +
        '", which is not a local database.\n' +
        'Only these hosts are allowed: ' +
        [...LOCAL_HOSTNAMES].join(', ')
    );
  }

  return hostname;
}

/* ------------------------------------------------------------------ *
 * Reading the works
 *
 * Straight out of lib/data/artworks.js, never retyped here. That file already
 * merges lib/data/image-manifest.json into each work, so the pixel dimensions
 * below are the real ones read from the files on disk by
 * scripts/generate-image-manifest.mjs — the one place they are allowed to come
 * from.
 * ------------------------------------------------------------------ */

const { readAllRecords } = await import('../lib/data/artworks.js');

/**
 * The two works left as drafts, by English slug.
 *
 * Chosen to exercise the point of DECISION 2 in migration 001: publication is
 * a separate axis from sale status, so a draft may hold any status. One of
 * these is available and one is sold, which is the combination that a single
 * published/unpublished boolean folded into `status` could not express.
 *
 * Neither is the featured work, and fourteen published works still fill the
 * homepage grid, which shows twelve.
 */
const DRAFT_SLUGS = new Set(['avocado', 'tuscan-house']);

/**
 * Shekels to agorot.
 *
 * lib/data/artworks.js holds the price as a whole number of shekels — 99999 —
 * because lib/format.js renders `amount` with maximumFractionDigits: 0. The
 * database stores agorot. This multiplication is the same conversion the
 * repository will need in both directions when it swaps over to SQL, and it is
 * exact on an integer.
 */
function toAgorot(shekels) {
  return shekels * 100;
}

/* ------------------------------------------------------------------ *
 * Statements
 * ------------------------------------------------------------------ */

const UPSERT_WORK = `
  insert into works (
    slug_he, slug_en,
    title_he, title_en,
    description_he, description_en,
    medium,
    width_cm, height_cm,
    price_agorot, price_reduced_agorot, price_currency,
    year, category, status, sale_channel,
    published_at, featured, has_placeholder_data,
    added_at, updated_at
  ) values (
    $1, $2,
    $3, $4,
    $5, $6,
    $7,
    $8, $9,
    $10, $11, $12,
    $13, $14, $15, $16,
    $17, $18, $19,
    $20, now()
  )
  on conflict (slug_en) do update set
    slug_he              = excluded.slug_he,
    title_he             = excluded.title_he,
    title_en             = excluded.title_en,
    description_he       = excluded.description_he,
    description_en       = excluded.description_en,
    medium               = excluded.medium,
    width_cm             = excluded.width_cm,
    height_cm            = excluded.height_cm,
    price_agorot         = excluded.price_agorot,
    price_reduced_agorot = excluded.price_reduced_agorot,
    price_currency       = excluded.price_currency,
    year                 = excluded.year,
    category             = excluded.category,
    status               = excluded.status,
    sale_channel         = excluded.sale_channel,
    published_at         = excluded.published_at,
    featured             = excluded.featured,
    has_placeholder_data = excluded.has_placeholder_data,
    added_at             = excluded.added_at,
    updated_at           = now()

  -- xmax is zero on a freshly inserted row and non-zero on one that an
  -- upsert updated, which is how a single statement can report which of the
  -- two it did. Only used for the counts printed at the end.
  returning id, (xmax = 0) as inserted
`;

const DELETE_IMAGES = `delete from work_images where work_id = $1`;

const INSERT_IMAGE = `
  insert into work_images (
    work_id, image_ref, pixel_width, pixel_height, type, position, alt_he, alt_en
  ) values ($1, $2, $3, $4, $5, $6, $7, $8)
`;

/* ------------------------------------------------------------------ *
 * Seeding
 * ------------------------------------------------------------------ */

async function seed() {
  const hostname = assertLocalDatabase();
  const works = readAllRecords();

  console.log('Seeding ' + works.length + ' works into the database at ' + hostname + '.');

  const pool = getPool();
  const client = await pool.connect();

  let inserted = 0;
  let updated = 0;
  let images = 0;

  try {
    await client.query('begin');

    // Clearing every star first, so the fixture's flags are the whole answer.
    // This used to be required by works_single_featured, which allowed one;
    // migration 015 dropped it, and many works may be starred now.
    await client.query('update works set featured = false where featured');

    for (const work of works) {
      const isDraft = DRAFT_SLUGS.has(work.slug.en);

      const result = await client.query(UPSERT_WORK, [
        work.slug.he,
        work.slug.en,
        work.title.he,
        work.title.en,
        work.description.he,
        work.description.en,

        // Null, and this is the one thing the seed cannot carry over.
        // Migration 001 made `medium` a closed set of two keys —
        // oil-on-canvas and pastel-on-paper — translated in the application.
        // The placeholder medium in lib/data/artworks.js is free text
        // ("[PLACEHOLDER] Medium not recorded yet"), and there is no key for
        // "not recorded yet". Null is the honest representation; inventing a
        // third key or defaulting to oil on canvas would be the fake data the
        // project rules exist to prevent.
        null,

        work.dimensions.width,
        work.dimensions.height,

        toAgorot(work.price.amount),

        // No discounts in the placeholder data, so the reduced price stays
        // null. Nothing in the seed exercises that column.
        null,

        work.price.currency,

        work.year,
        work.category,
        work.status,

        // Unknown for every work, including the sold ones — the data file has
        // never recorded which channel anything sold through.
        null,

        // The publication date is the date the work joined the catalogue, not
        // now(), so that two runs of this script produce identical rows.
        isDraft ? null : work.addedAt,

        work.featured,
        work.hasPlaceholderData,
        work.addedAt,
      ]);

      const { id, inserted: wasInserted } = result.rows[0];
      if (wasInserted) inserted += 1;
      else updated += 1;

      // Replaced rather than appended. The seed owns these rows, and appending
      // would trip works_images_one_main on the second run.
      await client.query(DELETE_IMAGES, [id]);

      for (const image of work.images) {
        await client.query(INSERT_IMAGE, [
          id,
          image.src,
          image.width,
          image.height,
          image.type,
          image.position,

          // Null in both languages: migration 002 says absent alt text means
          // the application derives it from the work's title in that language.
          null,
          null,
        ]);
      }

      images += work.images.length;
    }

    await client.query('commit');

    console.log(
      '\nDone. ' +
        inserted +
        ' inserted, ' +
        updated +
        ' updated, ' +
        images +
        ' images written.'
    );
    console.log(
      (works.length - DRAFT_SLUGS.size) +
        ' published, ' +
        DRAFT_SLUGS.size +
        ' left as drafts: ' +
        [...DRAFT_SLUGS].join(', ')
    );

    // Reported rather than deleted. Rows this script did not write are not its
    // to remove — and a work referenced by an order line cannot be deleted at
    // all, by design (on delete restrict in migration 003).
    const strays = await client.query(
      'select slug_en from works where slug_en <> all($1::text[]) order by slug_en',
      [works.map((work) => work.slug.en)]
    );
    if (strays.rowCount > 0) {
      console.log(
        '\nNote: ' +
          strays.rowCount +
          ' work(s) in the database are not in the data file and were left alone: ' +
          strays.rows.map((row) => row.slug_en).join(', ')
      );
    }
  } catch (error) {
    await client.query('rollback');
    console.error('\nSeeding failed and nothing was written.\n');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await seed();
