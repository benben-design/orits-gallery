import { Frank_Ruhl_Libre, Assistant } from 'next/font/google';

/**
 * The two type faces, loaded once for the whole site.
 *
 * Both carry Hebrew and Latin properly, which is the disqualifying test on this
 * project — most visitors read Hebrew, and a face that is elegant in English and
 * poor in Hebrew is not a candidate however good the mockup looks.
 *
 *   Frank Ruhl Libre — serif, headings. A Hebrew type family first, with Latin
 *                      designed alongside it rather than bolted on.
 *   Assistant        — sans, body and UI. Neutral and quiet in both scripts.
 *
 * next/font self-hosts these at build time, so there is no request to a third
 * party at runtime and no layout shift from a late-arriving webfont. They are
 * exposed as CSS variables and consumed only through the tokens in
 * app/tokens.css — never imported into a component.
 */

const display = Frank_Ruhl_Libre({
  subsets: ['latin', 'hebrew'],
  weight: ['300', '400', '500'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const body = Assistant({
  subsets: ['latin', 'hebrew'],
  weight: ['300', '400', '500'],
  variable: '--font-body-loaded',
  display: 'swap',
});

/** Put on <html> by each root layout, so the tokens can reference the faces. */
export const fontVariables = `${display.variable} ${body.variable}`;
