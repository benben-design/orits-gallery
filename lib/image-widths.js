/**
 * Every width an image on this site is ever delivered at, in one place.
 *
 * `next.config.mjs` hands these to `next/image` as `imageSizes` and
 * `deviceSizes`, which is what every srcset is built from. They are here rather
 * than written into the config because three other things need the same list
 * and must never disagree with it:
 *
 *   - **The full-screen viewer** caps what it asks for at one of these widths
 *     (`fullViewWidthCap` in `lib/image-loader.js`). A width that is not on the
 *     list is a transformation the image host has never been asked for — and
 *     once strict transformations is on, one it refuses, which is a blank
 *     painting. See images.md.
 *   - **Next's own optimiser** refuses any width that is not on the list, with
 *     a 400, for the local files.
 *   - **`scripts/check-image-crop.mjs`** checks the loader at every one of them.
 *
 * Imports nothing and reads no environment, because the config loads it in
 * plain Node and the viewer loads it in the browser. **Adding a width here adds
 * a transformation the host must allow before the deploy that emits it** — the
 * order is in images.md.
 */

/** The small widths, for an image that never fills the screen. */
export const IMAGE_SIZES = [160, 240, 320, 420, 540, 680];

/**
 * The large ones. Sized for the sharp photography that will replace the
 * stand-ins, not for the stand-ins themselves.
 */
export const DEVICE_SIZES = [640, 828, 1080, 1280, 1600, 1920, 2560];

/** Both, ascending — every width a delivery URL may name. */
export const DELIVERY_WIDTHS = [...IMAGE_SIZES, ...DEVICE_SIZES].sort((a, b) => a - b);
