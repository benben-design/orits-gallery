import { formatPrice } from '@/lib/format';
import styles from './Price.module.css';

/**
 * A work's price.
 *
 * Prices are not known yet, so every record carries an obviously fake amount.
 * While `isPlaceholder` is set the figure is rendered alongside a visible
 * "sample price" marker, so a dummy number cannot quietly pass for a real one
 * if this ships before the real prices land.
 */
export default function Price({ price, locale, dictionary, isPlaceholder = false }) {
  const formatted = formatPrice(price, locale);
  if (!formatted) return null;

  return (
    <span className={styles.price}>
      <span className={styles.amount}>{formatted}</span>
      {isPlaceholder ? (
        <span className={styles.marker}>{dictionary.price.placeholderNotice}</span>
      ) : null}
    </span>
  );
}
