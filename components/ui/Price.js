import { formatPrice } from '@/lib/format';
import { getStatusPresentation } from './statusPresentation';
import styles from './Price.module.css';

/**
 * A work's price, and the half of its status that the price carries.
 *
 * Two of the four statuses change what happens here rather than adding a badge:
 * a sold work keeps its price struck through, and a work that is not for sale
 * has no price at all — the amount is replaced by the words for it. The other
 * two render the plain amount. The full table is in statusPresentation.js.
 *
 * The replacement text is the same dictionary entry the badge would have used,
 * so there is one translation of "not for sale" rather than two that can drift.
 *
 * Prices are not known yet, so every record carries an obviously fake amount.
 * While `isPlaceholder` is set the figure is rendered alongside a visible
 * "sample price" marker, so a dummy number cannot quietly pass for a real one
 * if this ships before the real prices land.
 */
export default function Price({ price, locale, dictionary, isPlaceholder = false, status }) {
  const { price: mode } = getStatusPresentation(status);

  if (mode === 'replaced') {
    return <span className={styles.unavailable}>{dictionary.status['not-for-sale']}</span>;
  }

  const formatted = formatPrice(price, locale);
  if (!formatted) return null;

  return (
    <span className={styles.price}>
      <span className={[styles.amount, mode === 'struck' ? styles.struck : ''].filter(Boolean).join(' ')}>
        {formatted}
      </span>
      {isPlaceholder ? (
        <span className={styles.marker}>{dictionary.price.placeholderNotice}</span>
      ) : null}
    </span>
  );
}
