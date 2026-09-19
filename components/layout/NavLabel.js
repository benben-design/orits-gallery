import styles from './NavLabel.module.css';

/**
 * The words of a header control, and the hairline that draws in under them.
 *
 * One component rather than three copies because the destinations, the
 * language switch and the cart are one row of type and must answer the pointer
 * the same way. The line is drawn here once; `current` holds it drawn, in the
 * accent, for the page you are on.
 *
 * It only ever wraps the words — never an icon — because a rule running under
 * a glyph reads as a mistake. See code-style.md.
 */
export default function NavLabel({ current = false, children }) {
  return (
    <span className={[styles.label, current ? styles.current : ''].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
