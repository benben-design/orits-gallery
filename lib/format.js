import { getLocaleTag } from '@/lib/i18n/config';

/**
 * Locale-aware formatting helpers.
 *
 * These deliberately produce the same output on the server and in the browser
 * (fixed locale tag, no reliance on the machine's default locale and no
 * reliance on "now"), so nothing here can cause a hydration mismatch.
 */

/**
 * Formats a work's price object for display.
 *
 * @param {{amount: number, currency: string}} price
 * @param {string} locale
 */
export function formatPrice(price, locale) {
  if (!price || typeof price.amount !== 'number') return '';

  return new Intl.NumberFormat(getLocaleTag(locale), {
    style: 'currency',
    currency: price.currency,
    maximumFractionDigits: 0,
  }).format(price.amount);
}

/**
 * Formats a work's physical dimensions, e.g. "999 × 999 cm".
 *
 * @param {{width: number, height: number, unit: string}} dimensions
 */
export function formatDimensions(dimensions) {
  if (!dimensions) return '';
  const { width, height, unit } = dimensions;
  return `${width} × ${height} ${unit}`;
}

/**
 * A moment, as the admin reads it.
 *
 * **The timezone is pinned, and that is the whole reason this is here rather
 * than an `Intl` call at the call site.** The dev server runs in the artist's
 * timezone and a deployed one runs in UTC, so an unpinned formatter renders a
 * late-evening order on the wrong day depending on which machine drew the page.
 * Every date on this project describes something that happened in Israel.
 *
 * The locale tag is fixed for the same reason `formatPrice`'s is: server and
 * browser must produce identical output, and a formatter that reads the
 * machine's default produces a hydration mismatch on somebody else's laptop.
 *
 * @param {Date|string|null|undefined} value
 * @param {string} locale
 * @returns {string|null} Null when there is nothing to show, so a caller can
 *   decide whether an absent date is a blank or a dash.
 */
export function formatDateTime(value, locale = 'he') {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jerusalem',
  }).format(date);
}
