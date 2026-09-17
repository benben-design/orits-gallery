/**
 * The noindex directives, and the two route trees that carry them.
 *
 * `noarchive` is in there with the other two deliberately: it is what stops a
 * cached copy being served from a search result after the page itself has
 * stopped being offered.
 */
const NOINDEX = 'noindex, nofollow, noarchive';

/**
 * Both the bare path and everything beneath it, for each tree.
 *
 * `/admin/:path*` is documented as matching zero segments, which would make
 * `/admin` redundant — but that is an assumption about a matcher rather than
 * something this project can see break, and the header it would drop is the
 * one on the admin's own front door. The configuration this replaced hedged
 * the same way, and it cost nothing then either.
 */
const NOINDEX_PATHS = ['/admin', '/admin/:path*', '/dev', '/dev/:path*'];

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
   * `X-Robots-Tag` on the admin area and on the design-system page at /dev —
   * the second of the two ways both are kept out of search, beside
   * `app/robots.js` and each one's own root-layout metadata.
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
   * ordering cannot matter for these two paths, because `proxy.js`'s matcher
   * deliberately excludes both — `/admin` and `/dev` sit outside the locale
   * structure and the locale gate must never touch them.
   */
  async headers() {
    return NOINDEX_PATHS.map((source) => ({
      source,
      headers: [{ key: 'X-Robots-Tag', value: NOINDEX }],
    }));
  },

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
