import Image from 'next/image';

/**
 * The artist's name as a mark rather than as text: "Orit Bar Shai" in a brush
 * hand, drawn from `public/brand/wordmark.svg`.
 *
 * **An interim, and built to be replaced in one file.** The intended mark is
 * her own signature, as she signs her canvases; until one is supplied, the name
 * is set in Comforter Brush (SIL Open Font License 1.1) and **outlined** — the
 * letters are shapes in the SVG, not a font the page loads. Swapping in the
 * signature means replacing that file and the two dimensions below, and nothing
 * else.
 *
 * Outlined rather than loaded as a webfont, for three reasons:
 *
 *   - frontend/styles.md allows two faces, and they are spent. A logo is a
 *     drawing of one word, not a typeface the site sets text in.
 *   - The brush texture is thousands of points. As a font that is a 600KB file
 *     for thirteen letters; as one cached SVG it is about 11KB compressed and is
 *     fetched once for the whole site.
 *   - It renders identically everywhere, which a mark has to.
 *
 * **One mark in both languages, in Latin letters.** A signature is not
 * translated, and two different hands for two scripts would read as two
 * brands. Its alt text is therefore the Latin name, marked `lang="en"`, and it
 * comes from `site.wordmark` in the locale files, which holds the same value in
 * both. That is deliberate rather than an untranslated string: the accessible
 * name of an image of text should be the text in the image, so that a visitor
 * steering by voice can say what they see. The Hebrew name still appears in
 * Hebrew wherever the site writes it as text.
 *
 * `unoptimized` because an SVG has nothing to resize: it skips
 * `lib/image-loader.js`, whose job is paintings, and the built-in optimiser,
 * which refuses SVG. The file is served as it is.
 */

/** The file's own viewBox size, so the box is reserved before it loads. */
const WORDMARK_SRC = '/brand/wordmark.svg';
const WORDMARK_WIDTH = 976;
const WORDMARK_HEIGHT = 192;

export default function Wordmark({ alt, className = '' }) {
  return (
    <Image
      src={WORDMARK_SRC}
      width={WORDMARK_WIDTH}
      height={WORDMARK_HEIGHT}
      alt={alt}
      lang={alt ? 'en' : undefined}
      className={className}
      unoptimized
      /* Above the fold on every page, and small: never lazy. It does not
         preload, so it cannot compete with the hero's poster for LCP. */
      loading="eager"
    />
  );
}
