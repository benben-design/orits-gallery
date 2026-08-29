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
