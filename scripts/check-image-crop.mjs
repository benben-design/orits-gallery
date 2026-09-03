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
import { transformationFor } from '../lib/image-loader.js';
import imageLoader from '../lib/image-loader.js';

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
const WIDTHS = [160, 240, 320, 420, 540, 680, 640, 828, 1080, 1280, 1600, 1920, 2560];

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

if (failures.length > 0) {
  console.error('\n  ' + failures.length + ' variant(s) break the never-crop rule:\n');

  for (const failure of failures) {
    const reason = failure.local
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

    console.error('    w_' + failure.width + ' — ' + reason);
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
