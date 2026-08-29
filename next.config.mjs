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

  // Paintings are served from /public and optimised by Next's built-in image
  // pipeline. No external image service yet — see .claude/rules/images.md.
  images: {
    // The current files are low-resolution stand-ins. These widths are sized
    // for the sharp replacements, not for what is in the repo today.
    imageSizes: [160, 240, 320, 420, 540, 680],
    deviceSizes: [640, 828, 1080, 1280, 1600, 1920, 2560],
  },
};

export default nextConfig;
