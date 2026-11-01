import { useEffect, useRef } from 'react';

/**
 * Warns before leaving a form whose contents would save differently from how
 * the page arrived — closing the tab, reloading, following any link in the
 * admin, or signing out.
 *
 * **Changed means "would submit something else"**, not "was touched". The
 * whole form is read as it would be posted — every field, and the hidden ones
 * the image panels put into it from outside with the `form` attribute, the
 * additional images included — once when the page has settled, and again at
 * the moment of leaving. Typing a word and deleting it again is no change;
 * adding a photograph and removing it is none either. Nothing is tracked field
 * by field, so a field added to the form later is covered without anyone
 * remembering it.
 *
 * Two routes out, because they are different events:
 *
 *   - **Closing, reloading, or typing an address**: `beforeunload`, which shows
 *     the browser's own dialog. Its wording is the browser's; a page cannot
 *     set it.
 *   - **A link inside the admin**: Next's `<Link>` navigates on the client and
 *     never unloads the page, so `beforeunload` does not see it. A click
 *     listener on the window, in the capture phase, runs before Next's own
 *     handler and asks with the platform's `confirm`, in the form's language;
 *     declining stops the click there. Sign-out is a form post, so another
 *     form being submitted is asked about the same way.
 *
 * **Saving is never warned about.** Submitting the form itself is not leaving
 * it, and a successful save redirects without a link click or an unload.
 *
 * @param {string} formId - The form to watch, as its `id`.
 * @param {string} message - The question asked before following a link.
 */
export function useUnsavedChangesWarning(formId, message) {
  const baselineRef = useRef(null);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return undefined;

    /* After the first paint, so every panel's hidden fields are in place. */
    const settle = requestAnimationFrame(() => {
      baselineRef.current = snapshot(form);
    });

    const isDirty = () => baselineRef.current !== null && snapshot(form) !== baselineRef.current;

    function onBeforeUnload(event) {
      if (!isDirty()) return;
      event.preventDefault();
      // Older browsers still look for a returnValue before they will ask.
      event.returnValue = '';
    }

    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest?.('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

      const destination = new URL(link.href, location.href);
      // A link to a place on this same page is not leaving it.
      if (destination.pathname === location.pathname && destination.search === location.search) return;

      if (isDirty() && !window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onSubmit(event) {
      if (event.target === form) return;
      if (isDirty() && !window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('click', onClick, true);
    window.addEventListener('submit', onSubmit, true);

    return () => {
      cancelAnimationFrame(settle);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('submit', onSubmit, true);
    };
  }, [formId, message]);
}

/**
 * The form as it would be posted, as one string. Next adds fields of its own
 * to a form whose action is a Server Action — `$ACTION_…` — and those say
 * nothing about what she changed, so they are left out.
 */
function snapshot(form) {
  return JSON.stringify(
    [...new FormData(form).entries()]
      .filter(([name]) => !name.startsWith('$ACTION'))
      .map(([name, value]) => [name, typeof value === 'string' ? value : value.name])
  );
}
