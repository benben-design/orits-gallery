import { Frank_Ruhl_Libre, Heebo, Rubik, Assistant } from 'next/font/google';

/**
 * TEMPORARY — the heading-font comparison on /admin/dev (03-11-2026).
 *
 * The artist finds Frank Ruhl Libre old-fashioned for headings and is choosing
 * a modern replacement on the real site. These three candidates are loaded
 * here, imported by the design-system page and by nothing else, so no public
 * page downloads them: next/font only emits the @font-face rules and files
 * into the route that imports the module, and app/fonts.js does not load them.
 *
 * Assistant is loaded again rather than reused from app/fonts.js because the
 * site loads 300/400/500 and the comparison needs 600. **It is preloaded on
 * purpose, matching app/fonts.js**: Assistant's weights share one file, and
 * when the two declarations disagreed about preloading the build emitted two
 * names for it, so every public page preloaded one and its CSS fetched the
 * other — Assistant downloaded twice, measured 03-11-2026 (+30KB, +0.15s
 * first paint). Only this page carries the preload links.
 *
 * **Heebo became the site's display face on 03-11-2026**, before her final
 * approval, so the comparison stays up for her to confirm it. Frank Ruhl Libre
 * is loaded here now, at the weights the site used to set it, so the previous
 * face can still be compared against.
 *
 * Delete this file, and the section in page.js that uses it, once she has
 * picked — the winner then goes into app/fonts.js properly.
 */

/* next/font reads each call at build time and accepts only a literal
   object, so the options are written out three times rather than shared. */
const frankRuhl = Frank_Ruhl_Libre({
  subsets: ['latin', 'hebrew'],
  weight: ['300', '400', '500'],
  variable: '--font-candidate-frank',
  display: 'swap',
  preload: false,
});

const heebo = Heebo({
  subsets: ['latin', 'hebrew'],
  weight: ['400', '600'],
  variable: '--font-candidate-heebo',
  display: 'swap',
  preload: false,
});

const rubik = Rubik({
  subsets: ['latin', 'hebrew'],
  weight: ['400', '600'],
  variable: '--font-candidate-rubik',
  display: 'swap',
  preload: false,
});

const assistant = Assistant({
  subsets: ['latin', 'hebrew'],
  weight: ['400', '600'],
  variable: '--font-candidate-assistant',
  display: 'swap',
  preload: true,
});

/** Put on the comparison section, so the variables exist inside it only. */
export const candidateFontVariables = `${frankRuhl.variable} ${heebo.variable} ${rubik.variable} ${assistant.variable}`;
