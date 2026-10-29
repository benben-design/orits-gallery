'use client';

import { RotateCcw } from 'lucide-react';
import ButtonLink from '@/components/ui/ButtonLink';
import FallbackPage from '@/components/ui/FallbackPage';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import { useFallback } from '@/components/layout/fallback-context';
import { localeHref } from '@/lib/i18n/config';
import styles from './error.module.css';

/**
 * What a public page shows when something throws while it renders — the
 * database not answering, most likely, since that is what every page reads.
 *
 * **It says nothing about the error.** No message, no stack, no digest: the
 * server log already has all of it, and a visitor can do nothing with a hash
 * except screenshot it. What they can do is try again, go home, or — when she
 * has a number set — tell the artist, so those are the whole page.
 *
 * `retry` is Next 16's: it re-fetches and re-renders this segment, which is
 * what a database that has just woken up needs. (`reset` would re-render
 * without fetching, and fail the same way.)
 *
 * **What it does not cover:** an error in the public layout itself — the
 * settings read every page makes. That is above this boundary and falls to
 * Next's own error page; a `global-error.js` would catch it, for the admin as
 * well, and was left out of this change.
 *
 * Error boundaries must be client components, so the copy comes from the
 * layout through `useFallback`, and the title and robots tag are React 19
 * elements rather than `metadata`, which a client file cannot export.
 */
export default function PageError({ retry }) {
  const { locale, pageError, whatsappHref } = useFallback();

  return (
    <>
      <title>{pageError.title}</title>
      <meta name="robots" content="noindex" />
      <FallbackPage
        title={pageError.title}
        body={pageError.body}
        actions={
          <>
            <button type="button" className={styles.retry} onClick={() => retry()}>
              <RotateCcw size={18} strokeWidth={1.5} aria-hidden="true" />
              {pageError.retry}
            </button>
            <ButtonLink href={localeHref(locale, '/')} variant="quiet">
              {pageError.home}
            </ButtonLink>
          </>
        }
        footnote={
          whatsappHref ? (
            <a
              href={whatsappHref}
              className={styles.whatsapp}
              target="_blank"
              rel="noreferrer noopener"
            >
              <WhatsAppIcon className={styles.whatsappIcon} />
              <span className={styles.whatsappLabel}>{pageError.whatsapp}</span>
            </a>
          ) : null
        }
      />
    </>
  );
}
