/**
 * Fills {placeholders} in a translated string.
 *
 *   interpolate('Painting: {title}', { title: 'Lemons' })  ->  'Painting: Lemons'
 *
 * Kept deliberately tiny — this is not a message-format library, and the
 * translation files should not need one.
 */
export function interpolate(template, values = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}
