/**
 * Which service resizes an image, decided per image.
 *
 * Wired in as `images.loaderFile` in next.config.mjs, so **every** `next/image`
 * on the site goes through this one function — no component passes a loader and
 * no component needs to know any of this. `next/image` calls it once per width
 * in the srcset, and whatever it returns is the URL the browser fetches.
 *
 * ## Two delivery paths, both live
 *
 *   - **A hosted painting** — one the artist uploaded — is resized **by the
 *     host**, by writing the transformation into its own URL. Sending it
 *     through this application's optimiser instead would mean downloading a
 *     file from one CDN so a serverless function can re-encode it and hand it
 *     to another: the same work done twice, and on a deployed site metered
 *     twice as well.
 *   - **A file inside this repository** — the sixteen stand-ins under
 *     `public/paintings/` — keeps Next's built-in optimiser, because there is
 *     no host to ask.
 *
 * The two are told apart the same way everything else in this codebase tells
 * them apart: **a local reference begins with a slash.** See
 * `isLocalImageRef` in works-repository.js, which makes the matching decision
 * about where an image's pixel dimensions come from.
 *
 * ## Why a loader file rather than a loader prop
 *
 * `next/image` also takes a `loader` prop per image, which would have made this
 * a two-line change in ArtworkFrame. It is not usable here: a function prop
 * cannot cross from a server component into `next/image`, so the component
 * passing it must be `'use client'` — and ArtworkFrame renders the gallery
 * grid, which must not become a client component. Measured, not assumed.
 *
 * The other trap is next to it. Setting `images.loader` to `'custom'` **turns
 * off `/_next/image` altogether** — the endpoint 404s — which would break every
 * one of the sixteen local paintings. `loaderFile` with `images.loader` left at
 * its default keeps the endpoint alive, and Next's own config validation allows
 * exactly that pairing. Do not "tidy" this by adding `loader: 'custom'`.
 */

/**
 * The marker that identifies a delivery URL this module can build a
 * transformation into.
 *
 * Structural rather than a hostname test, because what actually matters is
 * whether the URL has the shape the transformation slots into. A URL that does
 * not is returned untouched rather than mangled.
 */
const UPLOAD_MARKER = '/image/upload/';

/**
 * **The one transformation, and the rule it exists to keep.**
 *
 * `c_limit` scales an image down to fit inside the given width and **stops
 * there**: it never enlarges, and it never removes a pixel. Width is the only
 * bound given, so height follows the painting's own ratio.
 *
 * This is where the never-crop rule reaches the delivery layer for the first
 * time. Every other expression of it is in layout — a fixed frame, a fitted
 * mat, `object-fit: contain` — and all of that would go on looking correct
 * while the host quietly returned a cropped file. `c_fill`, `c_crop`,
 * `c_thumb`, `c_lfill` and `c_fill_pad` all discard pixels; `c_pad` keeps them
 * but invents a border, which is the mat's job and not the host's. **None of
 * them may appear here.** `scripts/check-image-crop.mjs` is what stops one
 * arriving later, because nothing on the page would look wrong if it did.
 *
 * `f_auto` negotiates AVIF or WebP per browser. `q_auto:good` is Cloudinary's
 * balanced setting rather than a fixed number — the knob to turn if the real
 * photography ever looks soft is this constant, and `q_auto:best` is the next
 * step up.
 */
const CROP_MODE = 'c_limit';

/**
 * Next's built-in optimiser endpoint.
 *
 * Written out because a custom loader is deliberately not given the image
 * config — Next strips it before calling, since it is internal — so `config.path`
 * is not available to read it from. It has been `/_next/image` for the whole
 * life of the App Router and this project does not set `images.path`.
 *
 * One behaviour of the built-in loader is not reproduced: it appends a
 * deployment id when `deploymentId` is configured, to invalidate optimiser
 * caches across deploys. This project does not configure one, so there is
 * nothing to append — **if that ever changes, it has to be added here too.**
 */
const OPTIMISER_PATH = '/_next/image';
const DEFAULT_QUALITY = 75;

/** Whether a stored reference points inside this repository. */
function isLocalImageRef(src) {
  return src.startsWith('/');
}

/**
 * The transformation segment for one width.
 *
 * Exported so `scripts/check-image-crop.mjs` can assert what it contains
 * without parsing a URL, and so there is exactly one place that decides what a
 * variant asks the host for.
 */
export function transformationFor(width, quality) {
  return [
    'f_auto',
    'q_' + (quality ? String(quality) : 'auto:good'),
    CROP_MODE,
    'w_' + width,
  ].join(',');
}

/**
 * @param {{src: string, width: number, quality?: number}} params - What
 *   `next/image` passes. It does **not** pass the image config; Next removes it
 *   before calling a user-defined loader.
 * @returns {string} The URL the browser fetches for this width.
 */
export default function imageLoader({ src, width, quality }) {
  if (isLocalImageRef(src)) {
    return (
      OPTIMISER_PATH +
      '?url=' +
      encodeURIComponent(src) +
      '&w=' +
      width +
      '&q=' +
      (quality || DEFAULT_QUALITY)
    );
  }

  const marker = src.indexOf(UPLOAD_MARKER);

  /**
   * Not a delivery URL whose shape we recognise. Returned as it is rather than
   * guessed at — a wrong URL here is a painting that does not load, and the
   * only images that can reach this branch are ones somebody stored by hand.
   */
  if (marker === -1) return src;

  const upTo = marker + UPLOAD_MARKER.length;
  return src.slice(0, upTo) + transformationFor(width, quality) + '/' + src.slice(upTo);
}

/* ------------------------------------------------------------------ *
 * The share image
 *
 * Not called by next/image — by the artwork page's metadata, for og:image. It
 * lives here because this is the one place a stored reference becomes a URL,
 * and because scripts/check-image-crop.mjs reads this file: the share image is
 * a delivery URL too, and the never-crop rule applies to it unchanged.
 * ------------------------------------------------------------------ */

/**
 * The widest a shared painting is delivered — the width the platforms draw a
 * large link card at.
 */
export const SHARE_IMAGE_WIDTH = 1200;

/**
 * The share image's transformation, the second and last one this site asks
 * the host for.
 *
 * **JPEG, fixed, rather than `f_auto`** — and stated by the address's
 * extension, not by a format parameter: `shareImageFor` ends every hosted share
 * address in `.jpg`, and the host delivers the format the extension names. A
 * crawler is not a browser: what it accepts is not negotiated the way a
 * browser's `Accept` header is, and a WhatsApp or Facebook preview must be a
 * format every one of them reads. That also covers an original the artist
 * uploaded as HEIC, which no crawler shows.
 *
 * **Why the extension and not `f_jpg`.** The host counts an address's extension
 * as part of the transformation, so under strict transformations `f_jpg` on
 * the original's own `.png`, `.webp` or `.heic` address would be one
 * allowed entry per source format — and the first upload in a new format would
 * lose its share preview with nothing to say so. With the extension fixed there
 * is exactly one share entry, whatever was uploaded, and the format is stated in
 * one place rather than two that could disagree.
 *
 * `q_auto` keeps it light — an original after the re-shoot can be 10MB, and
 * WhatsApp drops the preview for a heavy image. `c_limit`, width only, for the
 * reason `CROP_MODE` gives: it never enlarges and never removes a pixel.
 */
export function shareTransformation() {
  return ['q_auto', CROP_MODE, 'w_' + SHARE_IMAGE_WIDTH].join(',');
}

/** The extension every hosted share address ends in, which is what makes it a JPEG. */
export const SHARE_IMAGE_EXTENSION = '.jpg';

/**
 * The same address with its extension replaced by `.jpg` — or `.jpg` added,
 * if it has none. Only the last path segment is touched, so a dot in a folder
 * name is left alone.
 */
function withJpegExtension(src) {
  const lastSlash = src.lastIndexOf('/');
  const lastDot = src.lastIndexOf('.');
  const stem = lastDot > lastSlash ? src.slice(0, lastDot) : src;
  return stem + SHARE_IMAGE_EXTENSION;
}

/**
 * The picture on a shared link, and the dimensions of the file actually served.
 *
 * A hosted painting goes through the host at `SHARE_IMAGE_WIDTH`, its address
 * ending in `.jpg` whatever format was uploaded, and the declared width and
 * height are computed to match what `c_limit` returns: an original narrower
 * than that is served at its own size, since `c_limit` never enlarges, and the
 * height follows the painting's ratio. They are declared so a platform can lay
 * the card out before fetching, which only helps if they are true — verified
 * against the served files on 30-09-2026, png and webp originals included.
 *
 * **A local file is handed over as it is.** It is not on the host, so there is
 * nothing to ask; the stand-ins in `public/paintings/` are WhatsApp-compressed
 * JPEGs of at most 1600px, light already. An unrecognised reference is also
 * returned unchanged, as the loader does, rather than guessed at.
 *
 * @param {{src: string, width: number, height: number}} image - The stored
 *   reference and the original's pixel dimensions, as the repository returns them.
 * @returns {{src: string, width: number, height: number}}
 */
export function shareImageFor(image) {
  if (isLocalImageRef(image.src)) return image;

  const marker = image.src.indexOf(UPLOAD_MARKER);
  if (marker === -1) return image;

  const width = Math.min(image.width, SHARE_IMAGE_WIDTH);
  const height = Math.round((image.height * width) / image.width);
  const upTo = marker + UPLOAD_MARKER.length;

  return {
    src: withJpegExtension(image.src.slice(0, upTo) + shareTransformation() + '/' + image.src.slice(upTo)),
    width,
    height,
  };
}
