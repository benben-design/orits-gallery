/**
 * How a visitor reaches the artist directly, rather than through a form.
 *
 * **WhatsApp is the channel, and the reason is her buyers rather than taste.**
 * It is how Israeli customers talk to a seller — her own shop, Gita, promises
 * "available on WhatsApp or by phone" in its promises row — and a stranger
 * weighing a ₪2,000 painting on a site they have never heard of is far more
 * likely to send a message than to fill in a contact form.
 *
 * The number is the one Gita already publishes, confirmed for this site on
 * 19-09-2026. It is written here once, in international form, so the header
 * and anything that joins it later cannot disagree about it. Like the delivery
 * rate in lib/delivery.js it is destined for `/admin/settings`, which is why it
 * is a module rather than a literal in a component.
 *
 * Pure — no imports, no React — so plain Node can load it.
 */

/**
 * The WhatsApp number in the form wa.me requires: country code, no plus, no
 * leading zero, no separators. 052-432-1817 → 972524321817. Empty means "no
 * WhatsApp", and every caller renders nothing rather than a dead link.
 */
export const WHATSAPP_NUMBER = '972524321817';

/**
 * A link that opens a WhatsApp chat with the artist, the message already
 * typed. The message comes from the locale files so it arrives in the language
 * the visitor was reading; they can edit it before sending.
 *
 * @param {string} [message]
 * @returns {string | null} null when no number is configured
 */
export function whatsappHref(message) {
  if (!WHATSAPP_NUMBER) return null;

  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
