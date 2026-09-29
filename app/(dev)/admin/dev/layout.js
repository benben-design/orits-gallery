import '@/app/globals.css';
import { fontVariables } from '@/app/fonts';

/**
 * Root layout for the design-system page.
 *
 * This is the third root layout, in its own route group, for the same reason
 * the admin has one: the page sits outside the locale structure and must not
 * inherit the public shell. Because it is not under app/(site)/[locale], it
 * cannot appear in site navigation by construction — there is no link to omit
 * and no menu to remember to edit. See .claude/rules/app-files.md.
 *
 * **Its URL is /admin/dev, and the page calls the admin guard.** It is its own
 * group rather than part of (admin) because it needs this English,
 * left-to-right document instead of the admin's Hebrew shell; it is under
 * /admin because the session cookie is scoped to that path, so a guard at /dev
 * could never have seen a session.
 *
 * It is kept out of search results three ways, like the rest of the admin and
 * all three in effect: the robots metadata below, the /admin disallow in
 * app/robots.js, and the admin's `X-Robots-Tag` header in next.config.mjs —
 * which is where it belongs rather than in the host's configuration, because a
 * Netlify header rule never reaches a response produced by a function. See
 * .claude/rules/deployment.md.
 *
 * The document is English and left-to-right because the tool's own labels are
 * English. The specimens inside it carry their own dir="rtl" lang="he" — this
 * is the one page on the site where an inner `dir` is correct rather than a
 * patch, because showing both writing directions at once is the whole point of
 * a design-system page. See .claude/rules/i18n.md.
 */

export const metadata = {
  title: 'Design system · Orit Bar Shai',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function DevLayout({ children }) {
  return (
    <html lang="en" dir="ltr" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
