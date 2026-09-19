/**
 * The WhatsApp glyph, drawn to sit with the site's lucide icons.
 *
 * **Not from lucide, because lucide has none**: it dropped every brand logo in
 * its 1.0 release, so there is no `WhatsApp` to import. This is the outline
 * version from Tabler Icons (MIT, © Paweł Kuna), which is drawn the way lucide
 * is — a 24px grid, round caps and joins, a stroke rather than a fill — so it
 * takes the same `strokeWidth={1.5}` and reads as one icon set beside the cart.
 *
 * **Ink, never the brand's green.** A second colour in the chrome is a second
 * accent, and the paintings pay for every one of those. See frontend/styles.md.
 *
 * Decorative by default: the link around it carries the name.
 */
export default function WhatsAppIcon({ className = '', strokeWidth = 1.5 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
      <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
    </svg>
  );
}
