/**
 * The browser's half of an upload to the image host, shared by the main-image
 * panel and the additional-images panel so the two check, send and explain a
 * file in exactly the same way. Moved out of AdminImageUpload unchanged.
 *
 * Turning an error code into a sentence stays in each component, as
 * `labels.errors[code]`: that lookup is how `npm run check:strings` sees the
 * error sentences read, and it cannot follow a dictionary slice into a plain
 * function.
 *
 * **`ACCEPT_ANY_IMAGE` is written in two pieces on purpose.** The strings
 * check strips block comments with a pattern that takes the slash-star inside
 * `"image/*"` for the start of one, and silently ignores every string read up
 * to the next comment's end. Splitting the literal keeps it from opening one.
 *
 * No `'use client'` of its own: only client components import it, and it
 * touches `window`, `XMLHttpRequest` and `URL` only inside functions called
 * from event handlers.
 */

/* ------------------------------------------------------------------ *
 * Checking the file before it is sent
 * ------------------------------------------------------------------ */

/**
 * The host's own limits, applied here so a rejection can explain itself.
 *
 * The free plan refuses anything over 10MB or 25 megapixels. Letting it refuse
 * means she waits out an upload of a 40-megapixel scan and is then told nothing
 * she can act on — the failure arrives from another company's API, in English,
 * in the middle of a form. Checking first costs nothing and names the number.
 *
 * @returns {Promise<{code: string, values?: object}|null>} Null when the file
 *   is fine. A code and its substitutions otherwise — never a sentence, because
 *   the copy lives in the locale files.
 */
export async function checkFile(file, { maxBytes, maxPixels, maxMegabytes, maxMegapixels, allowedFormats }) {
  if (!file.type.startsWith('image/')) return { code: 'notAnImage' };

  /*
    By the file's extension, which is how a person knows what they picked. The
    host decides by content in the end, and refuses anything else under the
    signature; this only saves her an upload that was going to fail.
  */
  const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  if (!allowedFormats.includes(extension)) return { code: 'unsupportedFormat' };

  if (file.size > maxBytes) {
    return {
      code: 'tooLarge',
      values: {
        size: (file.size / (1024 * 1024)).toFixed(1),
        max: maxMegabytes,
      },
    };
  }

  const dimensions = await readImageDimensions(file);
  if (!dimensions) return { code: 'unreadable' };

  const pixels = dimensions.width * dimensions.height;
  if (pixels > maxPixels) {
    return {
      code: 'tooManyPixels',
      values: {
        pixels: (pixels / 1_000_000).toFixed(1),
        max: maxMegapixels,
      },
    };
  }

  return null;
}

/**
 * The pixel dimensions of a chosen file, read in the browser.
 *
 * Only ever used to refuse an image that is too large to upload. **It is not
 * what gets stored** — the server reads the real dimensions back from the host
 * after the upload, because a number this component reported is a number from
 * the client. See lib/image-host.js.
 *
 * An `Image` and an object URL rather than `createImageBitmap`, which decodes
 * the whole file into memory to answer a question about its header.
 */
function readImageDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new window.Image();

    probe.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    };

    // A file the browser cannot decode is not one the host will accept either,
    // whatever its content type claimed.
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    probe.src = url;
  });
}

/* ------------------------------------------------------------------ *
 * The upload itself
 * ------------------------------------------------------------------ */

/**
 * Posts the file to the image host and returns the identifier it assigns.
 *
 * `XMLHttpRequest` rather than `fetch`, for the one thing fetch still cannot
 * do: report how much of a request body has been sent. That is the whole
 * difference between a percentage and a spinner on a ten-megabyte upload.
 *
 * The signed fields are sent exactly as the server produced them. The host
 * recomputes the signature over everything it receives, so adding a field here
 * would not sneak a parameter past it — it would simply make every upload fail.
 */
export function uploadToHost(signed, file, onProgress) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    for (const [name, value] of Object.entries(signed.fields)) {
      body.append(name, value);
    }
    body.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', signed.endpoint);
    request.responseType = 'json';

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      const uploaded = request.response ?? {};

      if (request.status >= 200 && request.status < 300 && uploaded.public_id) {
        /**
         * The id is the only part of this the server will believe — it asks
         * the host for the rest. The URL and dimensions come back too, and are
         * used **for the preview in this browser and nothing else**: showing
         * her the photograph she just uploaded needs no trust, and storing a
         * number from here would.
         */
        resolve({
          publicId: uploaded.public_id,
          previewUrl: uploaded.secure_url,
          previewWidth: uploaded.width,
          previewHeight: uploaded.height,
        });
        return;
      }

      reject(
        new Error(
          'Upload rejected with ' +
            request.status +
            ': ' +
            (request.response?.error?.message ?? 'no public_id in the response')
        )
      );
    };

    request.onerror = () => reject(new Error('Upload failed to reach the host'));
    request.onabort = () => reject(new Error('Upload aborted'));

    request.send(body);
  });
}

/** Every image type, for a file input's `accept`. See the note above. */
export const ACCEPT_ANY_IMAGE = 'image/' + '*';
