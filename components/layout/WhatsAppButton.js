'use client';

import { usePathname } from 'next/navigation';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import { localeHref } from '@/lib/i18n/config';
import styles from './WhatsAppButton.module.css';

/**
 * The way to reach the artist directly, pinned to the corner of the screen on
 * every public page.
 *
 * It replaces the shortcut that used to sit beside "contact" in the header.
 * The header's version scrolled away with the bar's own row on a phone and was
 * a 20px glyph among six other controls; this one is present on the whole page
 * and is the only thing on the site that follows the visitor down it. WhatsApp
 * is the channel because it is how her buyers talk to a seller — see
 * lib/contact.js, which still owns the number and is still the only place it
 * is written.
 *
 * CLIENT COMPONENT, for one reason, and it is the same reason the navigation
 * beside it is one: **this is rendered by the public layout, and a layout
 * cannot know which page it is wrapping.** Checkout must not carry it, so the
 * path has to be read where it is known — see frontend/next.md, where that
 * limitation is recorded as measured rather than assumed. `usePathname` is
 * what PrimaryNav and LanguageSwitcher already rely on, so this adds no new
 * kind of dependency to the public shell.
 *
 * **Everything else is resolved on the server.** The href, with the message
 * already typed in the visitor's language, is built in the layout and handed
 * down as a string — exactly the arrangement the header used, and the reason
 * neither the number nor the dictionary reaches the browser.
 *
 * Renders nothing at all when no number is configured, which is `whatsappHref`
 * returning null in the layout above.
 */
export default function WhatsAppButton({ href, label, locale }) {
  const pathname = usePathname() ?? '';

  if (!href) return null;

  /*
    Absent from checkout, and this is a money rule rather than a layout
    preference: it would sit in the same corner as the control that pays, and
    the last thing a buyer needs one tap from confirming a ₪2,000 charge is a
    second bright target under their thumb. See commerce.md on what that page
    is for.

    Compared against the built path rather than a literal, so the locale prefix
    comes from one place. A pathname that has not resolved yet renders the
    button, which is the safe direction: every public page but this one carries
    it, and checkout is dynamic — it reads cookies — so its path is known while
    the server renders it and the button never reaches that HTML at all.
  */
  if (pathname === localeHref(locale, '/checkout')) return null;

  return (
    /*
      A plain anchor in a new tab: it leaves the site, so there is nothing for
      next/link to prefetch or route, and the painting the visitor was looking
      at stays open behind the chat.
    */
    <a
      href={href}
      className={styles.button}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
    >
      <WhatsAppIcon className={styles.icon} />
    </a>
  );
}
