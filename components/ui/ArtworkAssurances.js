import { Signature, Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatPrice } from '@/lib/format';
import styles from './ArtworkAssurances.module.css';

/**
 * The four things a stranger wants settled before paying ₪2,000 to a site they
 * have never heard of, set directly above the buy controls on an artwork page,
 * so the buttons are the last thing in the box and the list leads into them.
 *
 * Trust converts here (commerce.md): the questions this answers — is it the
 * real thing, what does it cost to get it home, can I change my mind, is my card
 * safe — are the ones asked at the moment of buying, and the place they are
 * asked is beside the button, not on a policy page.
 *
 * **Drawn only for a work that can be bought.** The caller decides that; on any
 * other work these promises are about a purchase that cannot happen.
 *
 * **The delivery line is the site's settings, never a number in code** — the
 * rate she set at /admin/settings and whether pickup is offered, the same two
 * facts checkout charges by. So a rate change is one save, and the promise here
 * cannot disagree with the total at checkout. A rate of zero says "free" rather
 * than "₪0".
 *
 * **Not interactive, so not the accent.** Every icon and word is in the muted
 * ink: the accent on this page belongs to the button above, and a list drawn in
 * it would read as four more things to press.
 *
 * "14 days to cancel" rather than "to return", deliberately: the right Israeli
 * consumer law gives is to cancel the transaction, it is what the promises and
 * the legal pages call it, and a buyer meeting two words for one promise
 * wonders whether they are two promises.
 *
 * @param {object} props
 * @param {object} props.copy - `dictionary.artwork`.
 * @param {string} props.locale
 * @param {{shippingFee: {amount: number, currency: string}, selfPickupOffered: boolean} | null} props.delivery
 *   From the site settings. Without it the delivery line is left out rather
 *   than guessed.
 */
export default function ArtworkAssurances({ copy, locale, delivery }) {
  const items = [
    { key: 'original', Icon: Signature, text: copy.assuranceOriginal },
    delivery && { key: 'delivery', Icon: Truck, text: deliveryLine(copy, locale, delivery) },
    { key: 'cancel', Icon: RotateCcw, text: copy.assuranceCancel },
    { key: 'payment', Icon: ShieldCheck, text: copy.assurancePayment },
  ].filter(Boolean);

  return (
    <ul className={styles.list} aria-label={copy.assurancesLabel}>
      {items.map(({ key, Icon, text }) => (
        <li key={key} className={styles.item}>
          <Icon className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function deliveryLine(copy, locale, { shippingFee, selfPickupOffered }) {
  const shipping =
    shippingFee.amount === 0
      ? copy.assuranceShippingFree
      : interpolate(copy.assuranceShipping, { fee: formatPrice(shippingFee, locale) });

  return selfPickupOffered ? interpolate(copy.assuranceWithPickup, { delivery: shipping }) : shipping;
}
