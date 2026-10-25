import WhatsAppIcon from './WhatsAppIcon';
import { interpolate } from '@/lib/i18n/interpolate';
import { localeHref } from '@/lib/i18n/config';
import { absoluteUrl } from '@/lib/site-url';
import { whatsappHref } from '@/lib/contact';
import styles from './AskAboutWork.module.css';

/**
 * A WhatsApp message to the artist about this one painting.
 *
 * The floating button in the corner already reaches her; what this adds is
 * **which work**. The message arrives prefilled with the painting's title and a
 * link to its page, in the language the visitor was reading, so she knows at a
 * glance what is being asked about rather than replying "which one?".
 *
 * ## Two shapes, chosen by whether the work can be bought
 *
 *   - **It can:** a quiet link after the buy controls and the reassurance
 *     list — "a question about this painting?". The buy button stays the one
 *     thing to do.
 *   - **It cannot** — sold, reserved, not for sale: there is no buy button, so
 *     this becomes the page's action, in the secondary button's dress. A
 *     sentence says why, in words true of *this* status (a reserved work may
 *     come free; a work that was never for sale has not "gone"), and the
 *     message asks for something similar instead of asking about the work.
 *
 * Renders nothing without a WhatsApp number in the settings, like every other
 * WhatsApp link on the site — a link to nobody is worse than none.
 *
 * ## The link inside the message uses the English slug
 *
 * `/he/art/lemons`, not the Hebrew address. The artwork route already
 * redirects a slug in the other language to the canonical one, so it lands in
 * the same place — and a Hebrew path inside a chat is shown as a run of
 * `%D7%…` escapes, which WhatsApp does not reliably turn into a link at all.
 * The title travels as text, encoded once by `whatsappHref`, which is what
 * keeps a Hebrew title readable in the chat.
 *
 * @param {object} props
 * @param {object} props.work
 * @param {string} props.locale
 * @param {object} props.copy - `dictionary.artwork`.
 * @param {string|null} props.whatsappNumber - From the site settings.
 * @param {boolean} props.available - Whether the work can be bought.
 */

/** The sentence an unavailable work is given, by status. */
const UNAVAILABLE_KEY_BY_STATUS = {
  sold: 'unavailableSold',
  reserved: 'unavailableReserved',
  'not-for-sale': 'unavailableNotForSale',
};

export default function AskAboutWork({ work, locale, copy, whatsappNumber, available }) {
  const url = absoluteUrl(localeHref(locale, '/art/' + work.slug.en));
  const message = interpolate(available ? copy.askMessage : copy.unavailableMessage, {
    title: work.title[locale],
    url,
  });
  const href = whatsappHref(whatsappNumber, message);

  if (!href) return null;

  /*
    A plain anchor in a new tab, as the floating button is: it leaves the site,
    and the painting the question is about stays open behind the chat.
  */
  if (available) {
    return (
      <a href={href} className={styles.ask} target="_blank" rel="noopener noreferrer">
        <WhatsAppIcon className={styles.icon} />
        <span className={styles.words}>{copy.askQuestion}</span>
      </a>
    );
  }

  return (
    <div className={styles.unavailable}>
      <p className={styles.reason}>
        {copy[UNAVAILABLE_KEY_BY_STATUS[work.status] ?? 'unavailableSold']}
      </p>
      <a href={href} className={styles.message} target="_blank" rel="noopener noreferrer">
        <WhatsAppIcon className={styles.icon} />
        <span>{copy.unavailableAction}</span>
      </a>
    </div>
  );
}
