'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import NavLabel from './NavLabel';
import styles from './PrimaryNav.module.css';

/**
 * The three destinations, which one you are on, and the WhatsApp shortcut
 * beside "contact".
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
 * **The shortcut sits closer to "contact" than the destinations sit to each
 * other**, so it reads as one of the ways to make contact rather than as a
 * fourth destination. It opens WhatsApp rather than a page of ours, and is
 * absent entirely when no number is configured — see lib/contact.js.
 */
export default function PrimaryNav({ links, label, shortcut = null, className = '' }) {
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

        {shortcut?.href ? (
          <li className={styles.shortcutItem}>
            {/* A plain anchor: it leaves the site, so there is nothing for
                next/link to prefetch or route. A new tab keeps the painting
                the visitor was looking at open behind the chat. */}
            <a
              href={shortcut.href}
              className={styles.shortcut}
              aria-label={shortcut.label}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon className={styles.shortcutIcon} />
            </a>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
