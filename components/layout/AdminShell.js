import Link from 'next/link';
import { signOut } from '@/app/(admin)/admin/actions';
import styles from './AdminShell.module.css';

/**
 * The admin chrome.
 *
 * Deliberately separate from the public shell: no site header, no footer, no
 * language switcher and no cart. The admin is Hebrew-only, so it renders no
 * language affordance at all — but its strings still come from the Hebrew
 * dictionary rather than being hard-coded, so the same rule holds everywhere.
 *
 * The navigation depends on whether anyone is signed in, and the two states are
 * not the same list with one item swapped:
 *
 *   - **Signed in:** the working links, plus the way out. There is no link to
 *     the login page, because offering someone a way to sign in while they are
 *     signed in is backwards.
 *   - **Signed out:** nothing. Every one of those links leads somewhere the
 *     guard will bounce straight back to the form, and a menu of dead ends
 *     reads as a broken site rather than a closed door. The only page reachable
 *     from here is the one they are already on.
 */
export default function AdminShell({ dictionary, signedIn, children }) {
  const links = signedIn
    ? [
        { key: 'dashboard', href: '/admin', label: dictionary.admin.nav.dashboard },
        { key: 'newWork', href: '/admin/works/new', label: dictionary.admin.nav.newWork },
        { key: 'orders', href: '/admin/orders', label: dictionary.admin.nav.orders },
      ]
    : [];

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.badge}>{dictionary.admin.shellLabel}</span>

        {signedIn ? (
          <nav aria-label={dictionary.admin.shellLabel}>
            <ul className={styles.navList}>
              {links.map((link) => (
                <li key={link.key}>
                  <Link href={link.href} className={styles.navLink}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                {/*
                  A form rather than a link, so signing out is a POST. A GET
                  would be followed by anything that prefetches or scans links —
                  and could be triggered from another site by an <img> pointing
                  at it, signing the artist out mid-edit.
                */}
                <form action={signOut}>
                  <button type="submit" className={styles.navLink}>
                    {dictionary.admin.nav.signOut}
                  </button>
                </form>
              </li>
            </ul>
          </nav>
        ) : null}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
