import InstagramIcon from '@/components/ui/InstagramIcon';
import FacebookIcon from '@/components/ui/FacebookIcon';
import styles from './SocialLinks.module.css';

/**
 * The artist's Instagram and Facebook, as two icon buttons.
 *
 * Shared by the About and contact pages so the two can never disagree about
 * how her pages are drawn. **The glyph alone is visible, so the accessible
 * name carries everything** — whose page, which platform, and that it opens in
 * a new tab — from the locale files, in the visitor's language.
 *
 * Each link is a site setting; one left empty is not rendered, and with both
 * empty this renders nothing at all, so a caller never draws an empty row.
 *
 * A server component: the icons are plain SVG, not lucide's client icons.
 *
 * @param {{instagramUrl: string|null, facebookUrl: string|null,
 *          labels: {instagram: string, facebook: string}, className?: string}} props
 */
export default function SocialLinks({ instagramUrl, facebookUrl, labels, className = '' }) {
  const links = [
    { key: 'instagram', href: instagramUrl, label: labels.instagram, Icon: InstagramIcon },
    { key: 'facebook', href: facebookUrl, label: labels.facebook, Icon: FacebookIcon },
  ].filter((link) => link.href);

  if (links.length === 0) return null;

  return (
    <ul className={[styles.list, className].filter(Boolean).join(' ')}>
      {links.map(({ key, href, label, Icon }) => (
        <li key={key}>
          <a
            href={href}
            className={styles.link}
            aria-label={label}
            title={label}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Icon className={styles.icon} />
          </a>
        </li>
      ))}
    </ul>
  );
}
