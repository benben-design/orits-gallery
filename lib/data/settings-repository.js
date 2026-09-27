/**
 * The site settings: the one row of migration 011.
 *
 * **The third data module**, beside the works and the orders, and it keeps
 * their three rules: every function async, plain serializable objects out, and
 * the database reached only through `lib/db.js`.
 *
 * It does not validate — `lib/data/settings-input.js` does, and hands this a
 * record whose rate is already in agorot and whose empty fields are already
 * null. It does not check who is calling either: authorisation belongs to the
 * caller, and every admin mutation verifies the session itself. Same division
 * of labour as the works repository, for the same reason — one job each, and
 * one place to look for either.
 *
 * **There is exactly one row, and its absence is loud.** 011 inserts it in the
 * same transaction that creates the table, the application never deletes it,
 * and nothing here falls back to defaults if it is missing. A default shipping
 * rate would be a price nobody chose, quietly charged; an error naming the
 * migration is a deploy that stops and says why.
 */
import { getPool } from '@/lib/db';

/**
 * The settings row, or the table itself, is missing.
 *
 * Raised for both, with the same message, because the remedy is the same:
 * apply migration 011 to whichever database this is. The most likely way to
 * meet it is code that reads settings reaching a database that has not had 011
 * applied — Neon, in particular — and the message is written for that moment.
 */
export class SiteSettingsMissingError extends Error {
  constructor(cause) {
    super(
      'The site_settings row is missing. It is created, with its one row, by ' +
        'database/migrations/011_create_site_settings_table.sql — apply that ' +
        'migration to this database.',
      cause ? { cause } : undefined
    );
    this.name = 'SiteSettingsMissingError';
  }
}

/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = '42P01';

const COLUMNS = `
  about_he,
  about_en,
  email,
  phone,
  whatsapp_number,
  instagram_url,
  facebook_url,
  shipping_fee_agorot,
  self_pickup_offered,
  portrait_image_ref,
  portrait_pixel_width,
  portrait_pixel_height,
  updated_at
`;

/**
 * Agorot to shekels, for display.
 *
 * This module's copy of the conversion, as the orders repository has its own:
 * one per repository, on the way out, and never in a component. The rate is
 * also handed back in agorot, so nothing that needs the integer ever has a
 * reason to multiply this one back.
 */
function toMajorUnits(agorot) {
  return agorot / 100;
}

/**
 * A row as the application sees it.
 *
 * The portrait comes back in the shape a work's image does — `src`, `width`,
 * `height` — so `ArtworkFrame` and the upload panel take it without knowing it
 * is not a painting. Its dimensions come from the columns and never from the
 * generated manifest: a portrait is only ever uploaded, so it is never a file
 * in `public/paintings/` for the manifest to have read.
 */
function toSettings(row) {
  return {
    about: { he: row.about_he, en: row.about_en },
    email: row.email,
    phone: row.phone,
    whatsappNumber: row.whatsapp_number,
    instagramUrl: row.instagram_url,
    facebookUrl: row.facebook_url,
    shippingFeeAgorot: row.shipping_fee_agorot,
    shippingFee: { amount: toMajorUnits(row.shipping_fee_agorot), currency: 'ILS' },
    selfPickupOffered: row.self_pickup_offered,
    portrait: row.portrait_image_ref
      ? {
          src: row.portrait_image_ref,
          width: row.portrait_pixel_width,
          height: row.portrait_pixel_height,
        }
      : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Runs one statement against the settings row, turning a missing table into
 * the error that names the migration rather than "relation does not exist".
 */
async function queryRow(sql, params = []) {
  let result;

  try {
    result = await getPool().query(sql, params);
  } catch (error) {
    if (error?.code === UNDEFINED_TABLE) throw new SiteSettingsMissingError(error);
    throw error;
  }

  if (result.rows.length === 0) throw new SiteSettingsMissingError();
  return toSettings(result.rows[0]);
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * The settings, as they stand.
 *
 * Deliberately **not cached**. The admin must see what it just saved, and the
 * checkout will read the shipping rate from here — a cart and a checkout are
 * never cached, see frontend/next.md. Where a public page wants it cached, that
 * is the page's decision, and every write here is followed by
 * `revalidatePublicSite()` in the action that made it.
 *
 * @returns {Promise<object>}
 * @throws {SiteSettingsMissingError}
 */
export async function getSiteSettings() {
  return queryRow(`select ${COLUMNS} from site_settings where id`);
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * Saves everything the settings form owns, in one statement.
 *
 * **It never touches the portrait.** The photograph is saved on its own the
 * moment its upload lands, by `setPortrait`, and the form carries no portrait
 * field — so a form save writing those columns could only ever write back
 * whatever the form happened to load, over an upload made since.
 *
 * `updated_at` is set here, because there is no trigger — the same arrangement
 * as `works`.
 *
 * @param {object} values - From `validateSettingsInput`: rate in agorot, empty
 *   fields null.
 * @returns {Promise<object>} The settings as saved.
 * @throws {SiteSettingsMissingError}
 */
export async function updateSiteSettings(values) {
  return queryRow(
    `update site_settings
        set about_he = $1,
            about_en = $2,
            email = $3,
            phone = $4,
            whatsapp_number = $5,
            instagram_url = $6,
            facebook_url = $7,
            shipping_fee_agorot = $8,
            self_pickup_offered = $9,
            updated_at = now()
      where id
      returning ${COLUMNS}`,
    [
      values.aboutHe,
      values.aboutEn,
      values.email,
      values.phone,
      values.whatsappNumber,
      values.instagramUrl,
      values.facebookUrl,
      values.shippingFeeAgorot,
      values.selfPickupOffered,
    ]
  );
}

/**
 * Records the artist's portrait, replacing any previous one.
 *
 * Takes what `lib/image-host.js` read back from the host — never numbers the
 * browser reported — and writes the three columns together, which is what
 * `site_settings_portrait_complete` requires anyway. The previous file is left
 * on the host, as a replaced painting's is: deleting remotely from a save path
 * is a half-succeeded save waiting to happen. See images.md.
 *
 * @param {{ref: string, width: number, height: number}} image
 * @returns {Promise<object>} The settings as saved.
 * @throws {SiteSettingsMissingError}
 */
export async function setPortrait(image) {
  return queryRow(
    `update site_settings
        set portrait_image_ref = $1,
            portrait_pixel_width = $2,
            portrait_pixel_height = $3,
            updated_at = now()
      where id
      returning ${COLUMNS}`,
    [image.ref, image.width, image.height]
  );
}
