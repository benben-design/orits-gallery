/**
 * The Facebook glyph, drawn to sit with the site's lucide icons.
 *
 * Not from lucide, which dropped every brand logo in its 1.0 release — the
 * outline version from Tabler Icons (MIT, © Paweł Kuna), taken from the same
 * place and for the same reason as `WhatsAppIcon`: a 24px grid, round caps and
 * a stroke, so it reads as one set at `strokeWidth={1.5}`. **Ink, never the
 * brand's own colour** — a second colour in the chrome is a second accent.
 *
 * Decorative: the link around it carries the name.
 */
export default function FacebookIcon({ className = '', strokeWidth = 1.5 }) {
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
      <path d="M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3" />
    </svg>
  );
}
