import { getStatusPresentation } from './statusPresentation';
import styles from './StatusBadge.module.css';

/**
 * A work's availability, when it is worth labelling.
 *
 * Status is one of four values — available, reserved, sold, not for sale — not
 * a boolean, because every painting is a one-off and may also be selling
 * elsewhere.
 *
 * **Only two of the four render a badge.** Available and not-for-sale return
 * null: available is the default and a badge on every card is noise, and
 * not-for-sale is the absence of a transaction rather than a stage of one, so
 * it is expressed on the price instead. The full table, and the reasoning for
 * each state, lives in statusPresentation.js — this component only renders the
 * half of it that is a badge.
 *
 * Callers must not assume something renders. `ArtworkCard` checks the same
 * table before drawing the separator that precedes this, so an absent badge
 * does not leave an orphaned rule behind it.
 */
export default function StatusBadge({ status, dictionary }) {
  const { badge } = getStatusPresentation(status);
  if (!badge) return null;

  const label = dictionary.status[status];
  if (!label) return null;

  return <span className={[styles.badge, styles[badge]].join(' ')}>{label}</span>;
}
