import '@/app/globals.css';
import { fontVariables } from '@/app/fonts';
import AdminShell from '@/components/layout/AdminShell';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale, getDirection, getLocaleTag } from '@/lib/i18n/config';
import { isSignedIn } from '@/lib/auth/admin-session';

/**
 * Root layout for the admin area.
 *
 * The admin sits outside the locale structure on purpose: it is Hebrew-only,
 * it is not part of the public site, and it gets its own shell with no site
 * header, no footer, no language switcher and no cart. That is why it is a
 * second root layout in its own route group — see .claude/rules/app-files.md.
 *
 * It is kept out of search results three ways: the robots metadata below,
 * app/robots.js, and an X-Robots-Tag header in vercel.json.
 */

export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);

  return {
    title: {
      default: dictionary.admin.shellLabel,
      template: `%s · ${dictionary.admin.shellLabel}`,
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

/**
 * Reading the session cookie here makes the whole admin area dynamic, which it
 * has to be: a layout that could be cached would show one person's navigation
 * to the next.
 *
 * This decides what the *shell* offers, and nothing more. It is not the guard —
 * a page is not protected by the chrome around it declining to link to it.
 */
export default async function AdminLayout({ children }) {
  const dictionary = await getDictionary(adminLocale);
  const signedIn = await isSignedIn();

  return (
    <html
      lang={getLocaleTag(adminLocale)}
      dir={getDirection(adminLocale)}
      className={fontVariables}
    >
      <body>
        <AdminShell dictionary={dictionary} signedIn={signedIn}>
          {children}
        </AdminShell>
      </body>
    </html>
  );
}
