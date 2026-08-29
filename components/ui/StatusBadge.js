import styles from './StatusBadge.module.css';

/**
 * A work's availability.
 *
 * Status is one of four values — available, reserved, sold, not for sale — not
 * a boolean, because every painting is a one-off and may also be selling
 * elsewhere. The label text comes from the dictionary, keyed by the raw status.
 *
 * Deliberately colourless: it is set in ink and muted ink like everything else,
 * because the paintings are the only colour on the page.
 */
export default function StatusBadge({ status, dictionary }) {
  const label = dictionary.status[status];
  if (!label) return null;

  return (
    <span className={[styles.badge, styles[status]].filter(Boolean).join(' ')}>{label}</span>
  );
}
