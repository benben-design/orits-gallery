/**
 * How a visitor reaches the artist directly, rather than through a form.
 *
 * **WhatsApp is the channel, and the reason is her buyers rather than taste.**
 * It is how Israeli customers talk to a seller — her own shop, Gita, promises
 * "available on WhatsApp or by phone" in its promises row — and a stranger
 * weighing a ₪2,000 painting on a site they have never heard of is far more
 * likely to send a message than to fill in a contact form.
 *
 * **The number itself is not here.** It is a site setting, stored in
 * `site_settings.whatsapp_number` (migration 011) and edited by the artist at
 * `/admin/settings`; `lib/data/settings-repository.js` reads it. What is left in
 * this module is how a number becomes a link, which is not something she edits.
 *
 * Pure — no imports, no React — so plain Node can load it.
 */

/**
 * A link that opens a WhatsApp chat with the artist, the message already
 * typed. The message comes from the locale files so it arrives in the language
 * the visitor was reading; they can edit it before sending.
 *
 * @param {string|null} number - In the form wa.me requires: country code, no
 *   plus, no leading zero, no separators — 972524321817. The database enforces
 *   that shape (`site_settings_whatsapp_international`) and the admin
 *   normalises what she types into it, so this does not re-check it.
 * @param {string} [message]
 * @returns {string | null} null when there is no number, and every caller then
 *   renders nothing rather than a dead link.
 */
export function whatsappHref(number, message) {
  if (!number) return null;

  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/**
 * A `tel:` link for a phone number written for reading.
 *
 * She may store `052-432-1817` or `+972 52 432 1817`; a dialler wants the
 * digits. The separators go from the href and stay in the text beside it.
 *
 * @param {string|null} phone
 * @returns {string|null}
 */
export function telHref(phone) {
  if (!phone) return null;
  const dialable = phone.replace(/[^\d+]/g, '');
  return dialable ? 'tel:' + dialable : null;
}

/**
 * A phone number as a visitor reads it: `052-432-1817`, `03-123-4567`.
 *
 * An Israeli number is grouped by its shape — a mobile is ten digits, 3-3-4; a
 * landline nine, 2-3-4 — and one stored in the international form
 * (`+972 52 …`, `972…`) is shown the way a local caller dials it. Anything
 * else is shown exactly as she typed it, because regrouping a number we do not
 * recognise is a way of printing a wrong one. The `tel:` link is built from
 * the stored value by `telHref`, not from this.
 *
 * @param {string|null} phone
 * @returns {string|null}
 */
export function displayPhone(phone) {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, '');
  if (/^\+?972\d{8,9}$/.test(digits)) digits = '0' + digits.replace(/^\+?972/, '');

  if (/^05\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (/^0[2-9]\d{7}$/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return phone;
}

/**
 * @param {string|null} email
 * @returns {string|null}
 */
export function mailtoHref(email) {
  return email ? 'mailto:' + email : null;
}

/**
 * A social link as a person reads it: no scheme, no `www.`, no trailing slash.
 * `https://www.instagram.com/orit/` becomes `instagram.com/orit`.
 *
 * @param {string} url
 * @returns {string}
 */
export function displayUrl(url) {
  return url.replace(/^https:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

/**
 * Every way of reaching the artist that is actually filled in, in the order
 * the contact page lists them — most direct first.
 *
 * **An empty setting is absent from this list**, not present and blank, so a
 * caller that renders what it is given cannot render a dead link. The count is
 * also the contact page's answer to "is there anything to show", which decides
 * whether it is indexed; see app/sitemap.js.
 *
 * @param {{whatsappNumber: string|null, phone: string|null, email: string|null,
 *          instagramUrl: string|null, facebookUrl: string|null}} settings
 * @param {string} [whatsappMessage] - Pre-typed, in the visitor's language.
 * @returns {{key: string, href: string}[]}
 */
export function contactMethods(settings, whatsappMessage) {
  return [
    { key: 'whatsapp', href: whatsappHref(settings.whatsappNumber, whatsappMessage) },
    { key: 'phone', href: telHref(settings.phone) },
    { key: 'email', href: mailtoHref(settings.email) },
    { key: 'instagram', href: settings.instagramUrl },
    { key: 'facebook', href: settings.facebookUrl },
  ].filter((method) => method.href);
}
