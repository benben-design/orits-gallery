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
