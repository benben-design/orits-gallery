/**
 * The Instagram glyph, drawn to sit with the site's lucide icons.
 *
 * Not from lucide, which dropped every brand logo in its 1.0 release — the
 * outline version from Tabler Icons (MIT, © Paweł Kuna), taken from the same
 * place and for the same reason as `WhatsAppIcon`: a 24px grid, round caps and
 * a stroke, so it reads as one set at `strokeWidth={1.5}`. **Ink, never the
 * brand's own colour** — a second colour in the chrome is a second accent.
 *
 * Decorative: the link around it carries the name.
 */
export default function InstagramIcon({ className = '', strokeWidth = 1.5 }) {
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
      <path d="M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4l0 -8" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M16.5 7.5v.01" />
    </svg>
  );
}
