import Link from 'next/link';
import styles from './ButtonLink.module.css';

/**
 * The site's link-shaped calls to action, and its emphasis scale:
 *
 *   - `outline` (default) — a hairline in ink, no fill. "See more of this":
 *     view the full gallery and its equivalents.
 *   - `primary` — the filled accent. "This is the thing to do here", and there
 *     is only ever one of those in view. The homepage hero's way into the
 *     paintings is the one that uses it.
 *   - `quiet` — no border, muted ink.
 *
 * It is a link, not a button — every use so far navigates.
 */
export default function ButtonLink({ href, variant = 'outline', className = '', children }) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
