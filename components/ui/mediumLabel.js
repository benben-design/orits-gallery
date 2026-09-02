/**
 * The words for a work's medium.
 *
 * **Medium is not bilingual content.** The database holds a closed key —
 * `oil-on-canvas` or `pastel-on-paper` — and the display strings are translated
 * in the application like any other piece of UI text, so the repository returns
 * the raw key in both languages and turning it into words belongs to whoever is
 * rendering. See i18n.md.
 *
 * It lives in one place because two surfaces need it — the grid card and the
 * artwork page — and a medium reading "oil-on-canvas" on one of them and
 * "shemen al canvas" on the other is one fact presented two ways, which is the
 * bug this project keeps writing rules against.
 *
 * **Optional, and null means absent.** There is no key meaning "not recorded
 * yet", so a work without one returns null and the caller renders nothing
 * rather than inventing a value or printing the word "null".
 *
 * An unknown key falls back to itself rather than to nothing: a medium added to
 * the database before its locale entries would then be visibly untranslated,
 * which is a seam someone fixes, where silence is a seam nobody sees.
 *
 * @param {object} work - A work as the repository returns it.
 * @param {string} locale
 * @param {object} dictionary
 * @returns {string|null}
 */
export function mediumLabel(work, locale, dictionary) {
  const key = work?.medium?.[locale];
  if (!key) return null;

  return dictionary?.medium?.[key] ?? key;
}
