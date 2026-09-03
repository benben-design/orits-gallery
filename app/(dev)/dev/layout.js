import '@/app/globals.css';
import { fontVariables } from '@/app/fonts';

/**
 * Root layout for the design-system page.
 *
 * This is the third root layout, in its own route group, for the same reason
 * the admin has one: /dev sits outside the locale structure and must not
 * inherit the public shell. Because it is not under app/(site)/[locale], it
 * cannot appear in site navigation by construction — there is no link to omit
 * and no menu to remember to edit. See .claude/rules/app-files.md.
 *
 * It is a developer tool and is kept out of search results three ways, matching
 * the admin: the robots metadata below, a disallow in app/robots.js, and an
 * X-Robots-Tag header that
 * `vercel.json` still holds and the new host does not read — see deployment.md.
 * **That third way is not in effect until it is carried over to Netlify**, so
 * the two above are what is actually doing the work today.
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
