/**
 * Validating and normalising a painting submitted from the admin.
 *
 * Pure: no database, no request, no React. It takes the loose strings a form
 * produces and either returns a clean record the repository can write, or a map
 * of which fields were wrong and why.
 *
 * **It returns error codes, never sentences.** The artist reads Hebrew and the
 * copy for every one of these lives in the locale files; a validator that
 * invents user-facing text puts a string outside them. See i18n.md.
 *
 * Everything closed is checked against the exported constants rather than
 * retyped — the four statuses, the two categories, the two media, the three
 * sale channels. The database constrains all of them too, but a constraint
 * violation surfacing to the artist is a raw Postgres error, which is a phone
 * call to her son. This is what turns that into a field she can fix.
 */
// The extension is required: this module is deliberately loadable by plain
// Node, not only through Next's bundler, so the validation can be exercised
// without starting the app.
import { WORK_STATUSES, WORK_CATEGORIES } from './artworks.js';

/** The closed set the schema allows for `medium`. Optional on a work. */
export const WORK_MEDIA = ['oil-on-canvas', 'pastel-on-paper'];

/** Where a work sold, when it did. Optional. */
export const SALE_CHANNELS = ['this-site', 'under1000', 'elsewhere'];

/**
 * The channels the artist ever picks by hand, in the order she picks them.
 *
 * `this-site` is deliberately absent. A sale through this site is recorded by
 * checkout at the moment money moves — it is never something anyone types — so
 * offering it in the admin invites a work to be marked sold here when it was
 * not, which is a lie about an order that does not exist. A work that already
 * carries it keeps it; the form shows that state rather than letting it be
 * chosen or quietly dropped.
 *
 * `under1000` comes first because it is the one she actually reaches for: the
 * artist sells there in parallel, and that is the sale the site cannot see.
 */
export const MANUAL_SALE_CHANNELS = ['under1000', 'elsewhere'];

/** Set by checkout, never by hand. */
export const AUTOMATIC_SALE_CHANNEL = 'this-site';

/** The status a sale channel belongs to. */
export const SOLD_STATUS = 'sold';

/**
 * The form field carrying a photograph uploaded before the work exists.
 *
 * Only the **create** form has one. On the edit page a finished upload is
 * recorded straight away by its own action, with the work's id bound
 * server-side; a work being created has no id to bind, so the reference travels
 * with the form instead.
 *
 * A constant because two places have to agree on the name — the panel that
 * writes it and the action that reads it — and a literal in each is how they
 * stop agreeing. It is **not** validated by `validateWorkInput`: what it holds
 * is an identifier at the image host, and the only thing that can say whether
 * it means anything is the host. See `readUploadedImage`.
 */
export const IMAGE_PUBLIC_ID_FIELD = 'imagePublicId';

/* ------------------------------------------------------------------ *
 * Additional images
 * ------------------------------------------------------------------ */

/**
 * How many images a work may carry beside its main one. The database holds the
 * same number as three position slots (migration 016), so this is the form's
 * copy of a limit it does not get to decide — change one, change both.
 */
export const ADDITIONAL_IMAGE_LIMIT = 3;

/**
 * The form field the additional images travel in, one entry per image, in the
 * order they were added. Each entry is a claim about an image, never the image:
 *
 *   - `existing:<uuid>` — a row this work already has, kept. The server looks
 *     the row up on the work it is saving; an id that is not one of that
 *     work's images is refused.
 *   - `upload:<public id>` — a file just uploaded to the host. The server asks
 *     the host what it is, exactly as for the main image.
 *
 * Constants because the panel writes them and the action reads them, and two
 * literals is how they stop matching.
 */
export const ADDITIONAL_IMAGES_FIELD = 'additionalImages';

/**
 * Present whenever the panel was on the page. Its absence — the image host not
 * configured, so no panel — means "leave this work's additional images alone",
 * which is different from an empty list, which means "she removed them all".
 */
export const ADDITIONAL_IMAGES_SHOWN_FIELD = 'additionalImagesShown';

const ADDITIONAL_IMAGE_ENTRY = /^(existing|upload):(.+)$/;

/**
 * Reads the additional-image entries out of a submitted form.
 *
 * @param {(name: string) => unknown[]} getAll - `formData.getAll`, bound.
 * @param {(name: string) => boolean} has - `formData.has`, bound.
 * @returns {{ok: true, entries: {kind: 'existing'|'upload', value: string}[] | null} |
 *           {ok: false, error: string}} `entries` is null when the panel was
 *   not on the page. Error codes, never sentences.
 */
export function readAdditionalImageEntries(getAll, has) {
  if (!has(ADDITIONAL_IMAGES_SHOWN_FIELD)) return { ok: true, entries: null };

  const entries = [];

  for (const raw of getAll(ADDITIONAL_IMAGES_FIELD)) {
    const match = typeof raw === 'string' ? ADDITIONAL_IMAGE_ENTRY.exec(raw.trim()) : null;
    if (!match) return { ok: false, error: 'additionalImageNotConfirmed' };
    entries.push({ kind: match[1], value: match[2] });
  }

  /*
    The panel never offers a fourth, so this is a form that was edited or a
    second tab. Refused with a sentence rather than left to the database, whose
    refusal would reach her as "something went wrong".
  */
  if (entries.length > ADDITIONAL_IMAGE_LIMIT) {
    return { ok: false, error: 'tooManyAdditionalImages' };
  }

  return { ok: true, entries };
}

/**
 * Physical size, in centimetres. The schema is numeric(6,1), so 9999.9 is the
 * largest it can hold; the lower bound is simply "bigger than nothing".
 */
const MAX_DIMENSION_CM = 9999.9;

/** A price ceiling that is absurd but not arbitrary: it fits in the column. */
const MAX_PRICE_SHEKELS = 21474836;

/**
 * Turns a title into a slug.
 *
 * Unicode-aware, because half the slugs on this site are Hebrew:
 * `\p{L}` keeps letters in any script, so "קנים בשקיעה" becomes
 * "קנים-בשקיעה" exactly as the existing records are shaped, and
 * "Reeds at Sunset" becomes "reeds-at-sunset".
 *
 * Slugs are permanent once a work is published (seo.md), so this only ever
 * *suggests* one. The form shows what it produced and lets it be corrected
 * before anything is saved.
 */
export function slugify(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFC')
    .trim()
    .toLowerCase()
    // Apostrophes vanish rather than becoming hyphens, including the Hebrew
    // geresh and gershayim, so "אמא'לה" does not become "אמא-לה".
    .replace(/['’׳״"]/g, '')
    // Everything that is not a letter or a digit becomes a single hyphen.
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/* ------------------------------------------------------------------ *
 * Field readers
 *
 * Each returns either a value or undefined, and records a code when the raw
 * input was present but unusable. Blank is not an error here — required-ness
 * is decided once, below, so that "missing" and "malformed" cannot disagree.
 * ------------------------------------------------------------------ */

function readText(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/** Optional text: an empty box means null, never the empty string. */
function readOptionalText(raw) {
  const text = readText(raw);
  return text === '' ? null : text;
}

function readNumber(raw) {
  const text = readText(raw);
  if (text === '') return undefined;

  // Comma as a decimal separator, because a Hebrew keyboard and an Israeli
  // habit both produce "50,5" for fifty and a half.
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function readChoice(raw, allowed) {
  const text = readText(raw);
  if (text === '') return undefined;
  return allowed.includes(text) ? text : NaN;
}

/**
 * A calendar date, as the 'YYYY-MM-DD' string the column stores.
 *
 * Deliberately not parsed into a Date and back: that drags the machine's
 * timezone in and can shift the day, which is the same trap the repository
 * avoids by reading `added_at::text` on the way out.
 */
function readDate(raw) {
  const text = readText(raw);
  if (text === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return NaN;

  const [year, month, day] = text.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;

  return text;
}

/* ------------------------------------------------------------------ *
 * The validator
 * ------------------------------------------------------------------ */

/**
 * Validates a submitted painting.
 *
 * @param {Record<string, unknown>} raw - Loose values, straight off the form.
 * @returns {{ok: true, value: object} | {ok: false, errors: Record<string, string>}}
 *   On success, `value` is ready for the repository: money already in agorot,
 *   optional fields already null, slugs already filled in from the titles when
 *   they were left blank.
 */
export function validateWorkInput(raw) {
  const errors = {};

  /* --- Titles, required in both languages -------------------------- */

  const titleHe = readText(raw.titleHe);
  const titleEn = readText(raw.titleEn);

  if (!titleHe) errors.titleHe = 'required';
  if (!titleEn) errors.titleEn = 'required';

  /* --- Slugs ------------------------------------------------------- *
   * Left blank, they are derived from the titles. Given explicitly, they are
   * still normalised — a slug typed with spaces or capitals would otherwise
   * become a permanent public URL nobody meant to publish.
   */

  const slugHe = slugify(readText(raw.slugHe) || titleHe);
  const slugEn = slugify(readText(raw.slugEn) || titleEn);

  if (titleHe && !slugHe) errors.slugHe = 'unusable';
  if (titleEn && !slugEn) errors.slugEn = 'unusable';

  /* --- Dimensions, required ---------------------------------------- */

  const width = readNumber(raw.widthCm);
  const height = readNumber(raw.heightCm);

  for (const [field, value] of [['widthCm', width], ['heightCm', height]]) {
    if (value === undefined) errors[field] = 'required';
    else if (Number.isNaN(value)) errors[field] = 'notANumber';
    else if (value <= 0) errors[field] = 'mustBePositive';
    else if (value > MAX_DIMENSION_CM) errors[field] = 'tooLarge';
  }

  /* --- Price ------------------------------------------------------- *
   * Entered in shekels because that is what the artist thinks in, stored in
   * agorot because that is what the database and any payment provider use.
   * The conversion happens once, here, on the way in — the mirror of
   * toMajorUnits on the way out. See data-layer.md.
   */

  const price = readNumber(raw.price);

  if (price === undefined) errors.price = 'required';
  else if (Number.isNaN(price)) errors.price = 'notANumber';
  else if (price < 0) errors.price = 'mustBePositive';
  else if (price > MAX_PRICE_SHEKELS) errors.price = 'tooLarge';

  const priceReduced = readNumber(raw.priceReduced);

  if (priceReduced !== undefined) {
    if (Number.isNaN(priceReduced)) errors.priceReduced = 'notANumber';
    else if (priceReduced <= 0) errors.priceReduced = 'mustBePositive';
    else if (typeof price === 'number' && !Number.isNaN(price) && priceReduced >= price) {
      // The database enforces this too. Catching it here means she is told
      // which box to change rather than shown a constraint name.
      errors.priceReduced = 'notBelowPrice';
    }
  }

  /* --- Closed sets -------------------------------------------------- */

  const category = readChoice(raw.category, WORK_CATEGORIES);
  if (category === undefined) errors.category = 'required';
  else if (Number.isNaN(category)) errors.category = 'notAllowed';

  const status = readChoice(raw.status, WORK_STATUSES);
  if (status === undefined) errors.status = 'required';
  else if (Number.isNaN(status)) errors.status = 'notAllowed';

  const medium = readChoice(raw.medium, WORK_MEDIA);
  if (Number.isNaN(medium)) errors.medium = 'notAllowed';

  const saleChannel = readChoice(raw.saleChannel, SALE_CHANNELS);
  if (Number.isNaN(saleChannel)) errors.saleChannel = 'notAllowed';

  /* --- Year, optional and deliberately unbounded -------------------- *
   * The schema puts no range on it, because a painting can be dated anything
   * and a range is a guess about someone else's catalogue.
   */

  const year = readNumber(raw.year);
  if (year !== undefined) {
    if (Number.isNaN(year) || !Number.isInteger(year)) errors.year = 'notANumber';
  }

  /* --- Added-at ----------------------------------------------------- */

  const addedAt = readDate(raw.addedAt);
  if (addedAt === undefined) errors.addedAt = 'required';
  else if (Number.isNaN(addedAt)) errors.addedAt = 'notADate';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      slugHe,
      slugEn,
      titleHe,
      titleEn,
      descriptionHe: readOptionalText(raw.descriptionHe),
      descriptionEn: readOptionalText(raw.descriptionEn),
      medium: medium ?? null,
      widthCm: width,
      heightCm: height,
      priceAgorot: Math.round(price * 100),
      priceReducedAgorot:
        priceReduced === undefined ? null : Math.round(priceReduced * 100),
      year: year ?? null,
      category,
      status,
      saleChannel: saleChannel ?? null,
      addedAt,
      // A record the artist typed is real data, whatever else is still
      // placeholder elsewhere in the catalogue. This is what stops her work
      // rendering with the "sample price" marker beside it.
      hasPlaceholderData: false,
      // Publication is a separate axis from sale status: absent means draft,
      // and a work is a draft unless she said otherwise on this submission.
      publish: raw.publish === 'on' || raw.publish === true,
    },
  };
}

/**
 * A work record turned back into the loose strings the admin form holds.
 *
 * The inverse of `validateWorkInput`, and it lives beside it so the two stay in
 * step: a field added to one without the other is either a value the edit form
 * cannot show or a value it silently blanks on save.
 *
 * Everything comes out as a string, including numbers, because that is what an
 * `<input>` holds and what `FormData` will send back. Null becomes '' so a
 * missing optional field renders as an empty box rather than the word "null".
 *
 * Money goes back to shekels — the record already carries it that way, having
 * been converted once in the repository — so this multiplies nothing.
 *
 * @param {object} work - As returned by the repository.
 * @returns {Record<string, string>}
 */
export function workToFormValues(work) {
  const text = (value) => (value === null || value === undefined ? '' : String(value));

  return {
    titleHe: text(work.title.he),
    titleEn: text(work.title.en),
    descriptionHe: text(work.description.he),
    descriptionEn: text(work.description.en),

    // Held per locale in shape only; both sides carry the same database key.
    medium: text(work.medium.he),

    widthCm: text(work.dimensions.width),
    heightCm: text(work.dimensions.height),
    price: text(work.price.amount),
    priceReduced: text(work.price.reducedAmount),
    year: text(work.year),
    category: text(work.category),
    status: text(work.status),
    saleChannel: text(work.saleChannel),
    addedAt: text(work.addedAt),
    slugHe: text(work.slug.he),
    slugEn: text(work.slug.en),

    // The checkbox's own idiom: present and 'on' when ticked, absent otherwise.
    publish: work.publishedAt ? 'on' : '',
  };
}
