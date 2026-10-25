/**
 * Asserts that the image loader never asks the host to crop a painting.
 *
 * WHY THIS EXISTS
 *
 * "A painting is never cropped" is the hardest rule in this repo, and until
 * images moved to a host it lived entirely in layout: a fixed frame, a fitted
 * mat, `object-fit: contain`. All of that is visible. You can see it break.
 *
 * Delivery is not. `lib/image-loader.js` writes a transformation into the URL
 * the browser fetches, and changing `c_limit` to `c_fill` there would return
 * cropped files into a layout that goes on looking perfectly correct — every
 * box the right size, every row aligned, and every painting quietly missing its
 * edges. Nothing in the page would look wrong, no test that renders markup
 * would fail, and the person who noticed would be the artist.
 *
 * So the rule needs an assertion at the delivery layer, and this is it. Same
 * shape as the other three guards: no dependencies, run by `npm run lint`,
 * prints a table either way, not in the build.
 *
 * THE ONE IMAGE THAT MAY BE CROPPED, AND WHY THIS STILL COVERS IT
 *
 * The artist's portrait fills its slot and is cropped to it, from the top —
 * decided 27-09-2026, because a photograph of a person hung on a painting's mat
 * read as a painting of her. That cropping is CSS inside
 * `components/ui/PortraitFrame`, never a transformation: the portrait is
 * delivered whole through the same loader, so everything below applies to it
 * unchanged.
 *
 * What this script adds for it is the other direction: the painting frame's
 * stylesheet must never acquire the portrait's `object-fit: cover`. The
 * exception lives in its own component precisely so that it cannot leak into
 * `ArtworkFrame`, and this is what notices if it does.
 *
 * WHAT IT CANNOT SEE
 *
 * A cropping transformation that is already inside a **stored** `image_ref`.
 * Nothing builds one — `readUploadedImage` stores the host's own untransformed
 * `secure_url` — but a URL pasted into the database by hand could carry one,
 * and this script only reads code.
 *
 * Exit codes: 0 every variant is width-limited, 1 one is not, 2 the loader is
 * missing or does not export what this expects, which means it moved and this
 * script needs to move with it.
 */
import { readFileSync } from 'node:fs';
import {
  transformationFor,
  shareTransformation,
  shareImageFor,
  SHARE_IMAGE_WIDTH,
  SHARE_IMAGE_EXTENSION,
  fullViewWidthCap,
  fullViewLoader,
} from '../lib/image-loader.js';
import imageLoader from '../lib/image-loader.js';
import { DELIVERY_WIDTHS } from '../lib/image-widths.js';

/**
 * Every Cloudinary crop mode that discards pixels, plus `c_pad`, which keeps
 * them but invents a border — that is the mat's job, and a padded file inside a
 * padded frame is a painting floating in two mats.
 *
 * `c_limit` and `c_scale` are the only modes that return the whole image;
 * `c_fit` does too but may enlarge, which turns a low-resolution stand-in into
 * a blurred one. Only `c_limit` is permitted.
 */
const CROPPING_MODES = [
  'c_fill',
  'c_crop',
  'c_thumb',
  'c_lfill',
  'c_fill_pad',
  'c_pad',
  'c_mfit',
  'c_mpad',
  'c_imagga_crop',
  'c_imagga_scale',
  'c_auto',
];

const REQUIRED_MODE = 'c_limit';

/** A real delivery URL, in the shape readUploadedImage stores. */
const HOSTED =
  'https://res.cloudinary.com/kjsom6uz/image/upload/v1787219901/orit-works/lemons.jpg';

/** And a local one, which must keep the built-in optimiser. */
const LOCAL = '/paintings/lemons.jpg';

/** The widths next.config.mjs declares, which is what the srcset asks for. */
const WIDTHS = DELIVERY_WIDTHS;

if (typeof imageLoader !== 'function' || typeof transformationFor !== 'function') {
  console.error(
    '\n  lib/image-loader.js does not export what this check expects:\n' +
      '  a default loader function and a named transformationFor().\n'
  );
  process.exit(2);
}

console.log('\nImage delivery — no transformation may crop a painting');
console.log('  Values read from lib/image-loader.js\n');

const failures = [];
const rows = [];

for (const width of WIDTHS) {
  const url = imageLoader({ src: HOSTED, width });
  const transformation = transformationFor(width);

  const cropping = CROPPING_MODES.filter((mode) =>
    // Bounded so that c_limit is not read as a match for a mode it prefixes,
    // and so a mode appearing inside the public id cannot trip the check.
    new RegExp('(^|[/,])' + mode + '([,/]|$)').test(url)
  );

  const limited = new RegExp('(^|[/,])' + REQUIRED_MODE + '([,/]|$)').test(url);
  const widthBound = url.includes('w_' + width);

  // The whole point of c_limit is that height is never constrained: give it one
  // and the two together become a box the painting is fitted to, not a width.
  const heightBound = /(^|[/,])h_\d+([,/]|$)/.test(url);

  const ok = limited && widthBound && !heightBound && cropping.length === 0;
  if (!ok) failures.push({ width, url, cropping, limited, widthBound, heightBound });

  rows.push({ width, transformation, ok });
}

for (const row of rows) {
  console.log(
    '  w_' + String(row.width).padEnd(6) +
      row.transformation.padEnd(40) +
      (row.ok ? 'width-limited' : 'REFUSED')
  );
}

/* ---- the local path must not be transformed at all ------------------- */

const localUrl = imageLoader({ src: LOCAL, width: 640 });
const localOk =
  localUrl.startsWith('/_next/image?') &&
  localUrl.includes(encodeURIComponent(LOCAL)) &&
  !CROPPING_MODES.some((mode) => localUrl.includes(mode)) &&
  !localUrl.includes(REQUIRED_MODE);

console.log('\n  local file kept on the built-in optimiser');
console.log('  ' + LOCAL.padEnd(28) + (localOk ? 'untransformed' : 'REFUSED'));

if (!localOk) {
  failures.push({ width: 640, url: localUrl, local: true });
}

/* ---- and an unrecognised reference must be left alone ---------------- */

const foreign = 'https://example.test/some/image.jpg';
const foreignOk = imageLoader({ src: foreign, width: 640 }) === foreign;

console.log('  ' + 'an unrecognised host'.padEnd(28) + (foreignOk ? 'passed through' : 'REFUSED'));
if (!foreignOk) failures.push({ width: 640, url: foreign, foreign: true });

/* ---- the share image: the second transformation, the same rule --------- */

const share = shareTransformation();
const shareParts = share.split(',');

/*
  JPEG is stated by the address's extension and by nothing else: every hosted
  share address must end in .jpg whatever was uploaded, and no format parameter
  may sit in the transformation to overrule it — f_auto there would hand a
  crawler WebP or AVIF under a .jpg name. One extension is also what keeps the
  share image to one allowed entry under strict transformations.
*/
const UPLOADED = 'https://res.cloudinary.com/kjsom6uz/image/upload/';
const SHARED = UPLOADED + share + '/';

/** Each stored reference, and the one share address it must become. */
const SHARE_CASES = [
  ['v1/orit-works/lemons.jpg', 'v1/orit-works/lemons.jpg'],
  ['v1/orit-works/lemons.png', 'v1/orit-works/lemons.jpg'],
  ['v1/orit-works/lemons.webp', 'v1/orit-works/lemons.jpg'],
  ['v1/orit-works/lemons.heic', 'v1/orit-works/lemons.jpg'],
  // No extension at all: one is added rather than nothing happening.
  ['v1/orit-works/lemons', 'v1/orit-works/lemons.jpg'],
  // A dot in a folder name is not an extension.
  ['v1/orit.v2/lemons', 'v1/orit.v2/lemons.jpg'],
];
const sharesAsJpeg = SHARE_CASES.every(
  ([stored, served]) =>
    shareImageFor({ src: UPLOADED + stored, width: 3000, height: 4000 }).src === SHARED + served
);

const sharedLarge = shareImageFor({ src: HOSTED, width: 3000, height: 4000 });
const sharedSmall = shareImageFor({ src: HOSTED, width: 800, height: 600 });
const sharedLocal = { src: LOCAL, width: 1582, height: 1600 };
const shareOk =
  SHARE_IMAGE_EXTENSION === '.jpg' &&
  sharesAsJpeg &&
  shareParts.includes(REQUIRED_MODE) &&
  shareParts.includes('w_' + SHARE_IMAGE_WIDTH) &&
  !shareParts.some((part) => part.startsWith('f_')) &&
  !shareParts.some((part) => part.startsWith('h_')) &&
  !CROPPING_MODES.some((mode) => shareParts.includes(mode)) &&
  // The declared size is the served file's: scaled to the width, ratio kept,
  // and never enlarged past the original.
  sharedLarge.width === SHARE_IMAGE_WIDTH && sharedLarge.height === 1600 &&
  sharedSmall.width === 800 && sharedSmall.height === 600 &&
  shareImageFor(sharedLocal) === sharedLocal &&
  shareImageFor({ src: 'https://example.test/x.jpg', width: 10, height: 10 }).src === 'https://example.test/x.jpg';

console.log('  ' + 'the share image'.padEnd(28) + (shareOk ? share + ' + ' + SHARE_IMAGE_EXTENSION + ', size declared as served' : 'REFUSED — ' + share));
if (!shareOk) failures.push({ share: true, url: sharedLarge.src });

/*
  The painting frame never fills. Comments are stripped first, because the
  stylesheet's own comments name the declaration they forbid.
*/
const FRAME_STYLES = new URL('../components/ui/ArtworkFrame.module.css', import.meta.url);
const frameCss = readFileSync(FRAME_STYLES, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const frameFills = /object-fit\s*:\s*cover/.test(frameCss);

console.log(
  '  ' + 'ArtworkFrame stylesheet'.padEnd(28) + (frameFills ? 'FILLS — object-fit: cover' : 'fits, never fills')
);
console.log('  ' + 'the artist\'s portrait'.padEnd(28) + 'cropped by CSS in PortraitFrame, delivered whole');
if (frameFills) failures.push({ frame: true, url: 'components/ui/ArtworkFrame.module.css' });

/*
  The full-screen viewer. Its loader must name only widths the host allows,
  never a width past the first one that covers the original — and its
  stylesheet, which draws every painting at the largest it is ever shown, must
  never fill its box either.
*/
const VIEW_CASES = [
  [1582, 1600],
  [1600, 1600],
  [1601, 1920],
  [700, 828],
  [100, 160],
  [4000, 2560],
];
const capsOk = VIEW_CASES.every(([original, cap]) => fullViewWidthCap(original) === cap);
const viewLoaderOk = WIDTHS.every((width) => {
  const url = fullViewLoader(1582)({ src: HOSTED, width });
  return url === imageLoader({ src: HOSTED, width: Math.min(width, 1600) });
});
const VIEWER_STYLES = new URL('../components/ui/ArtworkViewer.module.css', import.meta.url);
const viewerCss = readFileSync(VIEWER_STYLES, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const viewerFills = /object-fit\s*:\s*cover/.test(viewerCss);
const viewOk = capsOk && viewLoaderOk && !viewerFills;

console.log(
  '  ' + 'the full-screen viewer'.padEnd(28) +
    (viewOk ? 'capped at the original, fits, never fills' : 'REFUSED — ' + (viewerFills ? 'object-fit: cover' : 'asks past the original'))
);
if (!viewOk) failures.push({ viewer: true, url: 'lib/image-loader.js, components/ui/ArtworkViewer.module.css' });

if (failures.length > 0) {
  console.error('\n  ' + failures.length + ' variant(s) break the never-crop rule:\n');

  for (const failure of failures) {
    const reason = failure.share
      ? 'the share image crops, binds height, is not a .jpg address with no format parameter, or declares a size it is not served at'
      : failure.frame
      ? 'the painting frame fills its box — that belongs to PortraitFrame and nothing else'
      : failure.viewer
      ? 'the full-screen view asks for more than the original holds, or fills its box'
      : failure.local
      ? 'a local file is no longer going to the built-in optimiser'
      : failure.foreign
        ? 'an unrecognised reference was rewritten instead of passed through'
        : failure.cropping?.length
          ? 'uses ' + failure.cropping.join(', ')
          : failure.heightBound
            ? 'constrains height as well as width, which fits the image to a box'
            : !failure.limited
              ? 'does not use ' + REQUIRED_MODE
              : 'does not bind the requested width';

    console.error('    ' + (failure.share ? 'share' : failure.frame ? 'frame' : failure.viewer ? 'viewer' : 'w_' + failure.width) + ' — ' + reason);
    console.error('      ' + failure.url);
  }

  console.error(
    '\n  The delivery layer is the one place the never-crop rule can break\n' +
      '  without anything on the page looking wrong. ' + REQUIRED_MODE + ' scales a\n' +
      '  painting down to fit the width and stops; every mode listed in this\n' +
      '  script either discards pixels or adds a border the mat already\n' +
      '  provides. See .claude/rules/images.md.\n'
  );

  process.exit(1);
}

console.log(
  '\n  ' + WIDTHS.length + ' widths checked, all width-limited; ' +
    'both delivery paths as specified.\n'
);
