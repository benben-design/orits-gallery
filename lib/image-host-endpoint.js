/**
 * Where the image host's API lives — and nothing else.
 *
 * **Its own module so that next.config.mjs can import it.** The config builds
 * the Content Security Policy's `connect-src` from `API_HOST`, because the
 * admin's browser uploads straight to it, and the config is loaded by plain
 * Node, outside React's server environment — so it cannot import
 * `lib/image-host.js`, which reads the account's credentials and is marked
 * `server-only`. This file reads no environment variable and imports nothing,
 * and must stay that way.
 */

/** One host, and the account is named by the cloud name rather than the key. */
export const API_HOST = 'https://api.cloudinary.com';
