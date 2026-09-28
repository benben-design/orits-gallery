/**
 * Validating the site settings submitted from the admin.
 *
 * The same shape as `work-input.js`, for the same reasons: pure — no database,
 * no React, no request — so plain Node can load it; error **codes** rather than
 * sentences, because the Hebrew lives in the locale files; and it is where
 * shekels become agorot on the way in, once.
 *
 * **Every rule migration 011 enforces is checked here first.** The database is
 * the backstop, not the messenger: a constraint violation reaching the artist
 * is a sentence about `site_settings_whatsapp_international` in English, which
 * she cannot act on. Each check below names the constraint it mirrors, so the
 * two can be read side by side.
 *
 * **Clearing a field is a choice, not a mistake.** Every text field except the
 * rate may be emptied, and an empty box becomes null — never the empty string,
 * which 011 refuses — meaning "not provided". The public site renders nothing
 * for it.
 *
 * Two fields are **normalised rather than refused**, because she will type
 * them the way people write them and the database wants them the way machines
 * read them. Anything the normalising cannot make sense of is still refused,
 * with a sentence saying what to do.
 */

/**
 * A ceiling on the shipping rate, in shekels.
 *
 * Not a policy — nobody is charging a thousand shekels to post a painting. It
 * catches a slipped key, where "400" was meant as "40", before it reaches every
 * checkout on the site. The column itself is an integer of agorot, so this is
 * also comfortably inside what it can hold.
 */
const MAX_SHIPPING_FEE_SHEKELS = 1000;

/* ------------------------------------------------------------------ *
 * Reading raw values
 * ------------------------------------------------------------------ */

function readText(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/**
 * Optional text: an empty box means null, never ''.
 *
 * Mirrors the `_not_blank` constraints in 011, which refuse a value that is
 * blank once trimmed. Trimming here first is what makes a box holding only
 * spaces a cleared field rather than a constraint violation.
 */
function readOptionalText(raw) {
  const text = readText(raw);
  return text === '' ? null : text;
}

/**
 * A number as she would type it: a comma is a decimal point, because a Hebrew
 * keyboard and an Israeli habit both produce "40,5". Undefined when empty, NaN
 * when present and unusable — the same convention `work-input.js` uses.
 */
function readNumber(raw) {
  const text = readText(raw);
  if (text === '') return undefined;

  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/* ------------------------------------------------------------------ *
 * Normalising
 * ------------------------------------------------------------------ */

/**
 * A WhatsApp number as she writes it, into the form wa.me needs.
 *
 * She will type `052-432-1817`, or `+972 52 432 1817`, or `00972…`. The link
 * wants `972524321817`: country code, no plus, no leading zero, no separators.
 * So the separators go, an international prefix (`+` or `00`) goes, and a
 * leading `0` is a local Israeli number and becomes `972`.
 *
 * What comes out is then held to exactly the rule 011 enforces
 * (`site_settings_whatsapp_international`): eight to fifteen digits, the first
 * not a zero. Letters, or a number too short to be one, fail that and are
 * refused rather than guessed at.
 *
 * Exported so it can be exercised on its own.
 *
 * @param {string} text - Already trimmed and non-empty.
 * @returns {string}
 */
export function normaliseWhatsappNumber(text) {
  let digits = text.replace(/[\s\-.()‎‏]/g, '');

  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = '972' + digits.slice(1);

  return digits;
}

const WHATSAPP_PATTERN = /^[1-9][0-9]{7,14}$/;

/**
 * A link to one of her pages, pasted however it was copied.
 *
 * Returns the address to store, or an error code.
 *
 *   - **No scheme at all** — `instagram.com/orit` — gets `https://` in front.
 *     That is what she means, and refusing it would be a rule about typing.
 *   - **A scheme written in capitals** is lowercased. 011's check is
 *     case-sensitive, so `HTTPS://` would otherwise pass here and fail there.
 *   - **Any other scheme**, `http://` included, is refused with `mustBeHttps`.
 *     Not upgraded silently: an http address may genuinely be a different page,
 *     and the brief is that a non-https link gets a message.
 *   - **Something that does not parse as a web address**, or has no dot in its
 *     host, is refused with `notALink` — a handle like `@orit` pasted on its own
 *     would otherwise become `https://@orit` and a link to nowhere.
 *
 * The scheme check mirrors `site_settings_instagram_https` and
 * `site_settings_facebook_https`, and it is not about tidiness: each of these
 * becomes an href in the footer of every public page, so a `javascript:` URL
 * here would be a link that runs code.
 *
 * Exported so it can be exercised on its own.
 *
 * @param {string} text - Already trimmed and non-empty.
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function normaliseSocialLink(text) {
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  let link = hasScheme ? text : 'https://' + text;

  if (/^https:\/\//i.test(link)) link = 'https://' + link.slice('https://'.length);
  else return { ok: false, error: 'mustBeHttps' };

  let parsed;

  try {
    parsed = new URL(link);
  } catch {
    return { ok: false, error: 'notALink' };
  }

  if (!parsed.hostname.includes('.') || parsed.username || parsed.password) {
    return { ok: false, error: 'notALink' };
  }

  return { ok: true, value: link };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Validates one submission of the settings form.
 *
 * @param {Record<string, unknown>} raw - The submitted fields, as posted.
 * @returns {{ok: true, value: object} | {ok: false, errors: Record<string, string>}}
 *   On success, `value` is ready for the repository: the rate already in
 *   agorot, every empty field null.
 */
export function validateSettingsInput(raw) {
  const errors = {};

  /* --- About ------------------------------------------------------ *
   * Both languages or neither — `site_settings_about_both_languages`.
   *
   * Refused here rather than silently completed, and the message is on the
   * missing side. Whether the English she did supply was *approved* is not
   * something this can know: that gate is form state, and the form will not
   * submit while a translation is waiting. This is the half that stops the
   * form's gate being stepped around by leaving the English out altogether.
   */
  const aboutHe = readOptionalText(raw.aboutHe);
  const aboutEn = readOptionalText(raw.aboutEn);

  if (aboutHe && !aboutEn) errors.aboutEn = 'aboutEnglishRequired';
  if (aboutEn && !aboutHe) errors.aboutHe = 'aboutHebrewRequired';

  /* --- Contact ---------------------------------------------------- *
   * Email and phone carry no format check, the same decision checkout made:
   * a pattern strict enough to mean anything refuses real addresses, and the
   * phone number is for reading rather than dialling.
   */
  const email = readOptionalText(raw.email);
  const phone = readOptionalText(raw.phone);

  let whatsappNumber = readOptionalText(raw.whatsappNumber);

  if (whatsappNumber) {
    whatsappNumber = normaliseWhatsappNumber(whatsappNumber);
    if (!WHATSAPP_PATTERN.test(whatsappNumber)) errors.whatsappNumber = 'whatsappInvalid';
  }

  /* --- Social ----------------------------------------------------- */
  const links = {};

  for (const field of ['instagramUrl', 'facebookUrl']) {
    const text = readOptionalText(raw[field]);

    if (!text) {
      links[field] = null;
      continue;
    }

    const link = normaliseSocialLink(text);
    if (link.ok) links[field] = link.value;
    else errors[field] = link.error;
  }

  /* --- Delivery --------------------------------------------------- *
   * Entered in shekels, stored in agorot — the conversion happens here, on the
   * way in, and nowhere else. Required: 011 gives the column no default, and a
   * blank rate is not "free", it is a question she has not answered. Free is
   * zero, which is allowed (`site_settings_shipping_fee_non_negative`).
   */
  const shippingFee = readNumber(raw.shippingFee);

  if (shippingFee === undefined) errors.shippingFee = 'required';
  else if (Number.isNaN(shippingFee)) errors.shippingFee = 'notANumber';
  else if (shippingFee < 0) errors.shippingFee = 'mustNotBeNegative';
  else if (shippingFee > MAX_SHIPPING_FEE_SHEKELS) errors.shippingFee = 'tooLarge';

  /* An unticked checkbox posts nothing at all, which is the "off" answer. */
  const selfPickupOffered = raw.selfPickupOffered === 'on';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      aboutHe,
      aboutEn,
      email,
      phone,
      whatsappNumber,
      instagramUrl: links.instagramUrl,
      facebookUrl: links.facebookUrl,
      shippingFeeAgorot: Math.round(shippingFee * 100),
      selfPickupOffered,
    },
  };
}

/**
 * Settings as the repository returns them, shaped as the form's initial values.
 *
 * The rate goes back out in shekels, from the major-unit copy the repository
 * already computed — nothing here divides money. The checkbox is `'on'` or
 * absent, the same value a submission carries, so a rejected save and a fresh
 * load render it the same way.
 *
 * @param {object} settings - From `getSiteSettings`.
 * @returns {Record<string, string>}
 */
export function settingsToFormValues(settings) {
  return {
    aboutHe: settings.about.he ?? '',
    aboutEn: settings.about.en ?? '',
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    whatsappNumber: settings.whatsappNumber ?? '',
    instagramUrl: settings.instagramUrl ?? '',
    facebookUrl: settings.facebookUrl ?? '',
    shippingFee: String(settings.shippingFee.amount),
    selfPickupOffered: settings.selfPickupOffered ? 'on' : '',
  };
}
