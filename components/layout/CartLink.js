import Link from 'next/link';
import { localeHref } from '@/lib/i18n/config';
import styles from './CartLink.module.css';

/**
 * The cart entry point in the header.
 *
 * A server component and a plain link: there is no cart state at this stage,
 * so nothing here needs the browser. When a real cart arrives, the item count
 * becomes the only part that has to move to the client.
 *
 * The icon is inline SVG rather than an icon package — the site pulls in no
 * component library.
 */
export default function CartLink({ locale, label }) {
  return (
    <Link href={localeHref(locale, '/cart')} className={styles.link} aria-label={label}>
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6 7h12l-1.2 10.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8Z" />
        <path d="M9.5 7V5.6a2.5 2.5 0 0 1 5 0V7" />
      </svg>
    </Link>
  );
}
