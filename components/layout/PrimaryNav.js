'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NavLabel from './NavLabel';
import styles from './PrimaryNav.module.css';

/**
 * The three destinations, and which one you are on.
 *
 * CLIENT COMPONENT, for one reason: marking the current page needs the current
 * path, and the header is rendered by a shared layout that cannot know which
 * page it sits on — see frontend/next.md. `usePathname` is the same answer the
 * language switcher beside it already relies on, so this adds no new kind of
 * dependency to the header.
 *
 * The list itself is plain links and renders on the server as well, so the
 * navigation works before hydration; only the current-page mark waits for it.
 *
 * **It is visible at every width**, including a phone, where it is a second
 * row under the name rather than a menu behind a button. Three destinations fit
 * a 390px screen with room to spare, and a menu button would hide the gallery —
 * the one link a visitor from Instagram most needs — behind a tap they have to
 * think of making.
 *
 * **The WhatsApp shortcut used to be the fourth item here**, pulled in tight
 * against "contact" so it read as a way of making contact rather than as a
 * destination. It is now a button fixed to the corner of the screen, on every
 * public page — see components/layout/WhatsAppButton. Nothing replaced it in
 * this row: three destinations are what this navigation is.
 */
export default function PrimaryNav({ links, label, className = '' }) {
  const pathname = usePathname() ?? '';

  return (
    <nav className={[styles.nav, className].filter(Boolean).join(' ')} aria-label={label}>
      <ul className={styles.list}>
        {links.map((link) => {
          /* A section counts as current on its own pages too, e.g. a future
             /gallery/<something>. The query string is not part of pathname, so
             a gallery filter is still the gallery. */
          const isCurrent = pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <li key={link.key}>
              <Link
                href={link.href}
                className={styles.link}
                aria-current={isCurrent ? 'page' : undefined}
              >
                <NavLabel current={isCurrent}>{link.label}</NavLabel>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
