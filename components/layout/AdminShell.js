import Link from 'next/link';
import styles from './AdminShell.module.css';

/**
 * The admin chrome.
 *
 * Deliberately separate from the public shell: no site header, no footer, no
 * language switcher and no cart. The admin is Hebrew-only, so it renders no
 * language affordance at all — but its strings still come from the Hebrew
 * dictionary rather than being hard-coded, so the same rule holds everywhere.
 */
export default function AdminShell({ dictionary, children }) {
  const links = [
    { key: 'dashboard', href: '/admin', label: dictionary.admin.nav.dashboard },
    { key: 'newWork', href: '/admin/works/new', label: dictionary.admin.nav.newWork },
    { key: 'orders', href: '/admin/orders', label: dictionary.admin.nav.orders },
    { key: 'login', href: '/admin/login', label: dictionary.admin.nav.login },
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.badge}>{dictionary.admin.shellLabel}</span>
        <nav aria-label={dictionary.admin.shellLabel}>
          <ul className={styles.navList}>
            {links.map((link) => (
              <li key={link.key}>
                <Link href={link.href} className={styles.navLink}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
