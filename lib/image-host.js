/**
 * The image host: signing an upload, and reading back what was uploaded.
 *
 * **The only place the image-host credentials are read**, and server-side only.
 * Named for the job rather than for the provider, exactly as `lib/translate.js`
 * is — that naming has already paid for itself once on this project when the
 * translation provider changed, and images are the more likely of the two to
 * move again.
 *
 * ## Why the file does not pass through our server
 *
 * A Server Action caps its request body at 1MB. The photographs this exists for
 * are several times that, and raising the cap would mean the whole file being
 * buffered by a serverless function that is billed by the second and killed by
 * the megabyte. So the browser posts the file **straight to the host**, and this
 * module does the two halves the server must own:
 *
 *   1. **Signing**, before the upload. The browser is handed a signature that
 *      is valid for one upload into one folder and nothing else.
 *   2. **Reading the asset back**, after it. What the browser reports about the
 *      file it just uploaded is a claim; this asks the host.
 *
 * ## Why the upload is signed rather than unsigned
 *
 * Cloudinary also offers an *unsigned upload preset*, which needs no server at
 * all. It is a public write endpoint into the artist's media library, named in
 * the page source, usable by anyone who views it, for as long as it exists. The
 * signature below is the difference between an upload we authorised and an
 * upload anyone can make.
 *
 * The signature covers **every parameter the upload may carry** — the host
 * recomputes it over everything it receives, so a browser that adds a
 * `public_id`, a `tag` or an eager transformation of its own invalidates it.
 * That is why only `folder` and `timestamp` are signed here: those two are the
 * whole of what an upload from this application is allowed to say.
 *
 * **Nothing here throws.** A missing key, a rejected key, a timeout or an
 * unexpected shape all come back as `{ ok: false, error }` with a code the
 * admin turns into Hebrew. The codes are codes, never sentences — the copy
 * lives in the locale files. See .claude/rules/i18n.md.
 */
/*
  Reads the account's credentials, so importing it from a client component must
  fail the build rather than ship them. The API host lives in
  image-host-endpoint.js, which reads nothing, because next.config.mjs needs it
  for `connect-src` and loads outside React's server environment.
*/
import 'server-only';
import { createHash } from 'node:crypto';
import { API_HOST } from '@/lib/image-host-endpoint';

/**
 * This module owns uploading and reading back. **Delivery is not its business**
 * — `lib/image-loader.js` is the one place that knows how a stored reference
 * becomes a URL the browser fetches, and it is loaded by the browser, so it
 * cannot import anything from here. The two touch only through the value
 * stored in `work_images.image_ref`.
 */

/**
 * Where an upload lands, by what it is.
 *
 * **Two folders, and the split is about what reads them rather than tidiness.**
 * The planned automation turns a file dropped into the paintings' folder into a
 * draft work, so anything in `orit-works` is presumed to be a painting. The
 * artist's portrait is not one, and in that folder it would become a draft
 * called "untitled" waiting for a price. It has a folder of its own.
 *
 * **A closed set of keys chosen by our own code, never a folder the browser
 * names.** The folder is signed, so it is the one thing an upload is allowed to
 * say about where it goes; letting the browser pick it would let it write into
 * any folder in her account. Each Server Action that signs an upload passes its
 * own key, fixed in its own body. Nothing about *which* work a file belongs to
 * is here either — that is recorded in the database when the upload is saved.
 */
export const UPLOAD_FOLDERS = Object.freeze({
  works: 'orit-works',
  portrait: 'orit-site',
});

/**
 * How long we wait on the host before giving up.
 *
 * This bounds the two small JSON calls — signing needs no network at all, and
 * reading an asset back is a single Admin API request. It deliberately does not
 * bound the upload itself, which is between the browser and the host and may
 * take a minute on a phone.
 */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * The free plan's own limits, checked in the browser before a byte is sent.
 *
 * These are not our policy — they are what the host refuses, read from its
 * usage endpoint: `image_max_size_bytes` 10485760 and `image_max_px`
 * 25000000. They are here rather than only in the browser because a limit
 * worth enforcing is worth stating in one place, and the message the artist
 * sees names the number.
 *
 * A rejection at the host is an opaque failure in the middle of an upload she
 * has already waited through. Rejecting a 40-megapixel scan before it is sent
 * costs nothing and can say why.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_PIXELS = 25_000_000;

/** Whole megabytes/megapixels, for the sentence that names the limit. */
export const MAX_UPLOAD_MEGABYTES = MAX_UPLOAD_BYTES / (1024 * 1024);
export const MAX_UPLOAD_MEGAPIXELS = MAX_UPLOAD_PIXELS / 1_000_000;

/**
 * The formats a photograph may arrive in, as the host names them.
 *
 * **Enforced three times, from this one list.** The signature covers it as
 * `allowed_formats`, so the host refuses anything else at upload and a browser
 * that drops the parameter breaks the signature; `readUploadedImage` refuses
 * any other format on read-back, which is the only check that also sees the
 * create path, where the asset id is a form field that can name anything in the
 * account; and the upload panel is handed it to refuse a file before a byte is
 * sent, like the size limits above.
 *
 * Why it matters: the host's `image` type also accepts PDF and SVG, and neither
 * is a photograph of a painting. `heic` is here because it is what a phone
 * shoots; the loader asks the host for `f_auto`, which delivers it in a format
 * the browser displays — verified 29-09-2026 — and the share image asks it for
 * a `.jpg` address, so nothing ever hands a crawler or a browser the HEIC
 * original.
 */
export const ALLOWED_UPLOAD_FORMATS = Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'heic']);

function credentials() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

/**
 * Whether the host is configured, answered on the server.
 *
 * What lets the admin leave the feature out entirely rather than offer a button
 * that fails: with no credentials the work form shows the notice it showed
 * before uploading existed, which is an honest absence rather than a broken
 * control. Same shape as `isTranslationConfigured`.
 */
export function isImageHostConfigured() {
  const { cloudName, apiKey, apiSecret } = credentials();
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * The host's upload signature.
 *
 * Cloudinary's scheme: take every parameter the upload will carry except the
 * file itself and the three that identify the account, sort them by name, join
 * them as a query string, append the API secret, and hash. The host repeats
 * that over what it actually receives and compares.
 *
 * SHA-1 because that is the algorithm the REST upload endpoint expects by
 * default. It is a shared-secret request authenticator with a one-hour window,
 * not a signature over a document anyone will keep — the collision work against
 * SHA-1 does not reach it, and choosing SHA-256 here means an account-level
 * setting that a future reader of this file would have no way to know about.
 */
function sign(params, apiSecret) {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => key + '=' + params[key])
    .join('&');

  return createHash('sha1').update(canonical + apiSecret).digest('hex');
}

/**
 * What the browser needs to upload one file, once.
 *
 * @param {'works'|'portrait'} destination - A key of `UPLOAD_FOLDERS`, passed by
 *   the Server Action that signs — never by the browser.
 * @returns {Promise<{ok: true, endpoint: string, fields: object} |
 *                   {ok: false, error: string}>}
 *
 * The timestamp is the expiry: the host refuses a signature older than an hour,
 * so this is not a credential that keeps working if it leaks out of the page.
 * Nothing here is secret — the API key is public by design and the secret never
 * leaves this module — but the signature authorises exactly one folder and no
 * parameters beyond it.
 */
export async function signImageUpload(destination) {
  const { cloudName, apiKey, apiSecret } = credentials();

  /*
    An unknown key is a programming error in this application, not something a
    visitor can cause — the actions pass literals. It still refuses rather than
    falling back to a default folder, because a portrait signed into the works
    folder is exactly the mistake the split exists to prevent.
  */
  const folder = Object.hasOwn(UPLOAD_FOLDERS, destination) ? UPLOAD_FOLDERS[destination] : null;

  if (!folder) {
    console.error('[image-host] signImageUpload called with an unknown destination', destination);
    return { ok: false, error: 'unexpected' };
  }

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('[image-host] signImageUpload called with no credentials');
    return { ok: false, error: 'notConfigured' };
  }

  const signed = {
    // Signed like everything else here: the host refuses any other format, and
    // a browser that drops or edits this breaks the signature.
    allowed_formats: ALLOWED_UPLOAD_FORMATS.join(','),
    folder,
    timestamp: Math.floor(Date.now() / 1000),
  };

  return {
    ok: true,
    endpoint: API_HOST + '/v1_1/' + cloudName + '/image/upload',
    /**
     * Sent verbatim as form fields beside the file. `api_key` is not part of
     * what is signed — the host reads it to know whose secret to check the
     * signature against.
     */
    fields: { ...signed, api_key: apiKey, signature: sign(signed, apiSecret) },
  };
}

/**
 * The host's own record of an uploaded asset.
 *
 * **This is the step that makes the direct upload safe to record.** The browser
 * reports a width, a height and a URL when an upload finishes, and none of it
 * is evidence: it is a value from the client, arriving at a server that is
 * about to write it to the database and render it to the public. So the only
 * thing taken from the browser is the identifier, and everything stored is read
 * back from the host under our own credentials.
 *
 * Getting this wrong is not abstract. Pixel dimensions are what reserves the
 * box before a painting loads — see .claude/rules/images.md — so a wrong pair
 * is a page that jumps, or a painting drawn at the wrong aspect ratio in a
 * layout whose whole rule is that a painting is never distorted or cropped.
 *
 * @param {string} publicId - As reported by the upload. An identifier, not a
 *   fact about the file.
 * @returns {Promise<{ok: true, image: {ref: string, width: number, height: number}} |
 *                   {ok: false, error: string}>}
 */
export async function readUploadedImage(publicId) {
  const { cloudName, apiKey, apiSecret } = credentials();

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('[image-host] readUploadedImage called with no credentials');
    return { ok: false, error: 'notConfigured' };
  }

  if (typeof publicId !== 'string' || publicId.trim() === '') {
    return { ok: false, error: 'notFound' };
  }

  /**
   * A public id carries its folder as slashes, and those are path separators in
   * this URL rather than characters to escape — so each segment is encoded and
   * the slashes between them are not. A `..` segment would climb the API path,
   * which is why it is refused rather than encoded.
   */
  const segments = publicId.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return { ok: false, error: 'notFound' };
  }

  const path =
    '/v1_1/' +
    cloudName +
    '/resources/image/upload/' +
    segments.map(encodeURIComponent).join('/');

  let response;

  try {
    response = await fetch(API_HOST + path, {
      headers: {
        // The Admin API is HTTP Basic over the key and secret. This request is
        // made by us, with our credentials, which is the whole point of it.
        authorization:
          'Basic ' + Buffer.from(apiKey + ':' + apiSecret).toString('base64'),
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // A timeout or a network failure. The upload itself may well have worked,
    // so the admin says to try saving again rather than to upload again.
    console.error('[image-host] asset lookup failed', error);
    return { ok: false, error: 'hostUnreachable' };
  }

  if (response.status === 404) return { ok: false, error: 'notFound' };

  if (!response.ok) {
    console.error(
      '[image-host] asset lookup returned ' + response.status + ' for ' + publicId
    );
    return { ok: false, error: response.status === 401 ? 'notConfigured' : 'unexpected' };
  }

  let asset;

  try {
    asset = await response.json();
  } catch (error) {
    console.error('[image-host] asset lookup returned unparseable JSON', error);
    return { ok: false, error: 'unexpected' };
  }

  /**
   * Everything stored comes from this response and nothing from the browser.
   * The dimensions are integers on the host's side; they are checked here
   * because a zero or a missing value would be written to columns the schema
   * requires to be positive, and a constraint violation is not an error message
   * the artist can act on.
   */
  const width = Number(asset?.width);
  const height = Number(asset?.height);
  const ref = asset?.secure_url;

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    console.error('[image-host] asset has no usable dimensions', asset);
    return { ok: false, error: 'unexpected' };
  }

  if (typeof ref !== 'string' || !ref.startsWith('https://')) {
    console.error('[image-host] asset has no delivery URL', asset);
    return { ok: false, error: 'unexpected' };
  }

  /*
    The format as the host detected it, not as anything was named. The signature
    already keeps a new upload to this list; this is what keeps out an asset that
    arrived some other way — uploaded through the host's own console, or named in
    the create form's hidden field — such as a PDF or an SVG, which the host
    files as images too.
  */
  const format = typeof asset?.format === 'string' ? asset.format.toLowerCase() : '';

  if (!ALLOWED_UPLOAD_FORMATS.includes(format)) {
    console.error('[image-host] asset format is not allowed', publicId, asset?.format);
    return { ok: false, error: 'unsupportedFormat' };
  }

  /**
   * The delivery URL is what goes into `work_images.image_ref`, rather than the
   * public id.
   *
   * Two reasons. It is what `next/image` can render with no loader and no
   * second module that knows how to assemble a URL — the components stay
   * exactly as they are. And it does not begin with a slash, which is precisely
   * how `works-repository.js` tells a hosted reference from a local one and
   * knows to read the pixel dimensions out of the database rather than out of
   * the generated manifest. The public id is inside this string if anything
   * ever needs it back.
   */
  return { ok: true, image: { ref, width, height } };
}
