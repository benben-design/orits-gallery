import { interpolate } from '@/lib/i18n/interpolate';
import { localeHref } from '@/lib/i18n/config';
import { formatPrice } from '@/lib/format';
import { whatsappHref } from '@/lib/contact';

/**
 * The WhatsApp message a purchase by contact opens with — so that the artist
 * knows exactly which paintings are being asked about, and for how much,
 * without a round of "which one?" first.
 *
 * In the visitor's language: a greeting, then every painting as its title and
 * a link to its page, then the total. The works are the ones the dialog shows,
 * which are only the ones that can be bought — a painting that sold while it
 * sat in the cart is neither listed nor counted, so she is never asked for a
 * painting that is gone.
 *
 * **The link uses the English slug**, which the artwork route redirects to the
 * canonical address in the language asked for. A Hebrew path arrives in a chat
 * as `%D7…` and may not be linked at all — the same reason `AskAboutWork`
 * gives. The title travels as text, and the whole message is encoded once, by
 * `whatsappHref`.
 *
 * `siteOrigin` comes from the server (`absoluteUrl`), because the client must
 * not guess the address the links should carry.
 *
 * @param {object} options
 * @param {string|null} options.whatsappNumber - The wa.me number, or null.
 * @param {object[]} options.works - Works as the repository returns them.
 * @param {{amount: number, currency: string}} options.total
 * @param {string} options.locale
 * @param {{intro: string, line: string, total: string}} options.message - The
 *   three templates, read from the `cart` slice by the caller (a component,
 *   which is where `check:strings` can see them read).
 * @param {string} options.siteOrigin - The site's absolute base, no trailing slash.
 * @returns {string|null} The wa.me link, or null when no number is set.
 */
export function purchaseWhatsappHref({ whatsappNumber, works, total, locale, message, siteOrigin }) {
  if (!whatsappNumber) return null;

  const lines = works.map((work) =>
    interpolate(message.line, {
      title: work.title[locale],
      url: siteOrigin + localeHref(locale, '/art/' + work.slug.en),
    })
  );

  const text = [
    message.intro,
    ...lines,
    interpolate(message.total, { total: formatPrice(total, locale) }),
  ].join('\n\n');

  return whatsappHref(whatsappNumber, text);
}
