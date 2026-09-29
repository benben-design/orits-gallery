import { HYP_PAYMENT_ORIGIN } from './lib/payments/hyp.js';
import { API_HOST as IMAGE_HOST_API_ORIGIN } from './lib/image-host.js';

/* ------------------------------------------------------------------ *
 * Security headers
 *
 * On every path — pages, /api and /admin alike — and declared here, in the
 * framework, for the reason the X-Robots-Tag rules below give at length: a
 * Netlify header rule never reaches a response a function produced.
 *
 * **Every external origin below is one the site actually uses**, mapped from
 * the code on 29-09-2026 with the file responsible for each; see security.md.
 * Links the visitor follows (wa.me, Instagram, Facebook, mailto:, tel:) are
 * navigations and need no entry. Calls the server makes — Gemini, Cloudinary's
 * admin API, Hyp's signing and verification — are not the browser's, and CSP
 * has nothing to say about them.
 * ------------------------------------------------------------------ */

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Where every uploaded painting and the portrait are delivered from: the host
 * of the `secure_url` that `lib/image-host.js` stores, resized there by the URL
 * `lib/image-loader.js` builds. Written here because no module holds it — the
 * loader keeps the stored URL and only inserts a transformation.
 */
const IMAGE_DELIVERY_ORIGIN = 'https://res.cloudinary.com';

/**
 * The local Hyp stand-in, in development only and only when the override is
 * set: checkout's no-script redirect goes there instead of to Hyp, and the
 * browser holds it to `form-action`. A malformed override adds nothing rather
 * than breaking the policy. `lib/payments/hyp.js` ignores the override in
 * production, and so does this — `isDevelopment` is false in every build.
 */
function developmentPaymentOrigin() {
  if (!isDevelopment || !process.env.HYP_ENDPOINT_OVERRIDE) return null;

  try {
    return new URL(process.env.HYP_ENDPOINT_OVERRIDE).origin;
  } catch {
    return null;
  }
}

/**
 * The policy, one directive per entry.
 *
 * **`script-src` allows inline, and no nonce is used — a decided trade.** A
 * nonce has to be fresh per response, which makes every page dynamic and
 * throws away the prerendered homepage and the cached gallery. What a nonce
 * would defend against is injected script, and this site renders no
 * user-supplied HTML anywhere: there is no `dangerouslySetInnerHTML`, React
 * escapes everything else, and the only author of content is the admin. See
 * security.md.
 *
 * Development differs in exactly two ways, and neither can reach a build:
 * `'unsafe-eval'`, which Next's development runtime needs, and the stand-in's
 * origin in `form-action` when the override is set.
 */
function contentSecurityPolicy() {
  const standIn = developmentPaymentOrigin();

  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(isDevelopment ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    // blob: is the admin upload measuring a file before it is sent
    // (components/admin/AdminImageUpload.js). No data: — nothing loads one.
    'img-src': ["'self'", 'blob:', IMAGE_DELIVERY_ORIGIN],
    // The hero loop is /video/ on this site; nothing plays from elsewhere.
    'media-src': ["'self'"],
    // next/font serves both faces from this origin; nothing asks Google at runtime.
    'font-src': ["'self'"],
    // The admin's upload goes from the browser straight to the image host.
    'connect-src': ["'self'", IMAGE_HOST_API_ORIGIN],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    // Without script, checkout's redirect to the payment page follows a form
    // post, and the browser applies this to it.
    'form-action': ["'self'", HYP_PAYMENT_ORIGIN, ...(standIn ? [standIn] : [])],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  // frame-ancestors says the same; this is for browsers that predate it.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // No Strict-Transport-Security: Netlify sends it for every site it serves,
  // and a second copy here could only disagree with it.
];

/**
 * The noindex directives, and the route tree that carries them.
 *
 * `noarchive` is in there with the other two deliberately: it is what stops a
 * cached copy being served from a search result after the page itself has
 * stopped being offered.
 */
const NOINDEX = 'noindex, nofollow, noarchive';

/**
 * Both the bare path and everything beneath it.
 *
 * `/admin/:path*` is documented as matching zero segments, which would make
 * `/admin` redundant — but that is an assumption about a matcher rather than
 * something this project can see break, and the header it would drop is the
 * one on the admin's own front door. The configuration this replaced hedged
 * the same way, and it cost nothing then either.
 *
 * The design system is covered here too: it moved from /dev to /admin/dev.
 */
const NOINDEX_PATHS = ['/admin', '/admin/:path*'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Next.js writes its own CLAUDE.md on dev start. CLAUDE.md in this repo must
   * stay a 0-byte file — it is read by the separate planning session, and
   * anything in it hands the planner the implementer role. Leaving this on
   * would silently refill the file on the next `next dev`.
   * See .claude/rules/workflow.md.
   */
  agentRules: false,

  /**
   * The development overlay sits bottom-left by default, which is exactly
   * where the floating WhatsApp button is — see
   * components/layout/WhatsAppButton. Two controls in one corner means the
   * button cannot be tested in the browser it is developed in.
   *
   * **Moved rather than switched off.** `devIndicators: false` would clear
   * the corner and take with it the thing that reports a failed compile;
   * the first symptom of that is a page that silently stops updating. It
   * costs nothing in production, where the overlay does not exist at all.
   */
  devIndicators: { position: 'bottom-right' },

  /**
   * The security headers above, on every path; and `X-Robots-Tag` on the
   * admin area, design system at /admin/dev included — the second of the two
   * ways it is kept out of search, beside `app/robots.js` and each root
   * layout's own metadata.
   *
   * **It is declared here rather than in the host's configuration, and that is
   * the whole point of this block.** Netlify's custom headers — in
   * `netlify.toml` or in a `_headers` file — are applied only to responses it
   * serves from its own store. They are never applied to a response produced
   * by a function, and every route under `/admin` is server-rendered: the
   * admin's root layout reads the session cookie, so nothing there is static.
   * A header rule written over there would therefore be a file that reads as
   * authoritative and does nothing at all, which is the failure
   * .claude/rules/deployment.md exists to prevent rather than to cause.
   *
   * Declared here it is part of the framework's own response, so it is carried
   * whether the route was prerendered or rendered on demand.
   *
   * The one documented difference on Netlify's adapter is that headers
   * declared here are evaluated **after** the proxy rather than before. That
   * ordering cannot matter for the admin, because `proxy.js`'s matcher
   * deliberately excludes it — `/admin` sits outside the locale structure and
   * the locale gate must never touch it. For public paths it can only affect
   * the locale redirect itself (`/` to `/he`), a response with no body.
   */
  async headers() {
    return [
      /*
        Every path. `/:path*` matches zero segments, so the root is included;
        `/` is listed as well for the reason NOINDEX_PATHS hedges, since the
        header it would drop is the one on the homepage.
      */
      { source: '/', headers: SECURITY_HEADERS },
      { source: '/:path*', headers: SECURITY_HEADERS },
      ...NOINDEX_PATHS.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: NOINDEX }],
      })),
    ];
  },

  /* No `X-Powered-By: Next.js` — it tells a stranger what to look up. */
  poweredByHeader: false,

  // The sixteen seeded paintings are served from /public. Anything the artist
  // uploads herself lives on the image host and is allowed below, so both kinds
  // go through Next's own pipeline and the components stay identical for each.
  // See .claude/rules/images.md.
  images: {
    // The current files are low-resolution stand-ins. These widths are sized
    // for the sharp replacements, not for what is in the repo today.
    imageSizes: [160, 240, 320, 420, 540, 680],
    deviceSizes: [640, 828, 1080, 1280, 1600, 1920, 2560],

    /**
     * Who resizes an image, decided per image. See lib/image-loader.js.
     *
     * A hosted painting is resized by the host, by writing the transformation
     * into its own URL; a file in `public/paintings/` keeps Next's built-in
     * optimiser. Both paths are live at once and no component knows which is
     * which — that is the whole reason this is a loader **file** and not a
     * `loader` prop, which cannot cross from a server component and would have
     * made the gallery grid a client component.
     *
     * **`images.loader` is deliberately left at its default.** Setting it to
     * `'custom'` makes `/_next/image` return 404, which would break every one
     * of the sixteen local paintings. Next's config validation accepts
     * `loaderFile` alongside the default loader precisely so both can work, and
     * this project depends on that pairing.
     */
    loaderFile: './lib/image-loader.js',

    /**
     * **There is deliberately no `remotePatterns` entry, and its absence is
     * load-bearing.**
     *
     * That list is what the *built-in* optimiser checks before fetching a
     * remote file. Hosted paintings never reach it — the loader above hands
     * back a host URL the browser fetches directly — so an entry would allow
     * nothing that happens and prevent nothing that could.
     *
     * What it would do is hide a mistake. If a hosted image ever did fall
     * through to the built-in optimiser, this site would quietly start
     * downloading and re-encoding files it is paying the host to have already
     * resized — the duplicated, twice-metered work this setup exists to avoid,
     * and invisible in the rendered page. With no pattern configured that same
     * mistake throws, by name, the first time it is rendered.
     */
  },
};

export default nextConfig;
