import Link from 'next/link';
import styles from './ButtonLink.module.css';

/**
 * The one call-to-action treatment on the site: a hairline outline in ink, no
 * fill and no colour. Used for "view the full gallery" and its equivalents.
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
