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
 *
 * `className` exists for one caller and one reason. The cart lays its prices
 * out in a column above a total, which only reads as a column if the amounts
 * share an edge — and they cannot while the marker sits inline beside them.
 * The cart passes a class that stacks the two. A prop rather than a selector
 * reaching in from another stylesheet: this component owns its own markup, and
 * the day the real prices land and the marker disappears, nothing outside here
 * has to know.
 */
export default function Price({
  price,
  locale,
  dictionary,
  isPlaceholder = false,
  status,
  className = '',
}) {
  const { price: mode } = getStatusPresentation(status);

  if (mode === 'replaced') {
    return (
      <span className={[styles.unavailable, className].filter(Boolean).join(' ')}>
        {dictionary.status['not-for-sale']}
      </span>
    );
  }

  const formatted = formatPrice(price, locale);
  if (!formatted) return null;

  return (
    <span className={[styles.price, className].filter(Boolean).join(' ')}>
      <span className={[styles.amount, mode === 'struck' ? styles.struck : ''].filter(Boolean).join(' ')}>
        {formatted}
      </span>
      {isPlaceholder ? (
        <span className={styles.marker}>{dictionary.price.placeholderNotice}</span>
      ) : null}
    </span>
  );
}
