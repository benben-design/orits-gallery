'use client';

import { useEffect } from 'react';

/**
 * The site's one moment of motion: painting cards below the first screen rise
 * into place as they come into view, once, a beat apart along a row. Renders
 * nothing.
 *
 * **One moment, deliberately** (25-10-2026). Whole sections used to rise as
 * they scrolled in and every painting faded in as it loaded; together with the
 * page's generous spacing that read as template chrome, and on a fast scroll
 * it left the screen empty for a moment. Sections are simply there now. What
 * is left is the cards — the paintings arriving, which is the thing the page
 * is for — and nothing else moves on its own.
 *
 * **Nothing depends on this to become visible.** The server renders every card
 * in its final, visible state. This runs only after hydration, and only then
 * hides what is still *below* the first screen — so with no JavaScript, or a
 * script that fails, the page is simply all there, and nothing on the first
 * screen ever waits. Because the markup is identical on the server and at
 * hydration, there is nothing for React to report as a mismatch.
 *
 * **A card starts rising before it is on screen.** The observer looks a
 * quarter of a screen ahead, so by the time a card scrolls into view it is
 * already arriving rather than an empty slot waiting to begin.
 *
 * Under `prefers-reduced-motion: reduce` it does nothing at all.
 *
 * The state is `[data-rise]` on each card (components/ui/ArtworkCard), styled
 * in ArtworkCard.module.css: empty from the server, `pending` once hidden,
 * `shown` once it has come into view. A MutationObserver picks up what arrives
 * later — a client navigation, or a gallery filter, which changes the page
 * without changing its path.
 */

/** The beat between cards that come into view together, and its ceiling. */
const STAGGER_MS = 60;
const MAX_STAGGER_STEPS = 3;

export default function QuietMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (!('IntersectionObserver' in window)) return undefined;

    const rise = new IntersectionObserver(
      (entries) => {
        /*
          The cards that arrive in one callback are a row (or two) coming into
          view together. Ordered as they are read — top to bottom, then along
          the row in the page's direction — each waits a beat after the one
          before, so the row rises in reading order in both languages.
        */
        const rtl = document.documentElement.dir === 'rtl';
        const arriving = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => ({ el: entry.target, box: entry.boundingClientRect }))
          .sort(
            (a, b) =>
              Math.round(a.box.top - b.box.top) ||
              (rtl ? b.box.left - a.box.left : a.box.left - b.box.left)
          );

        arriving.forEach(({ el }, index) => {
          el.style.setProperty('--rise-delay', `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms`);
          el.dataset.rise = 'shown';
          rise.unobserve(el);
        });
      },
      { rootMargin: '0px 0px 25% 0px' }
    );

    // Below the first screen means below it at the moment we look, plus the
    // margin the observer looks ahead by: anything nearer than that is left
    // exactly as the server drew it.
    const belowFold = (el) => el.getBoundingClientRect().top > window.innerHeight * 1.25;

    function prepare(root) {
      if (!(root instanceof Element)) return;

      const cards = root.matches('[data-rise=""]') ? [root] : [];
      cards.push(...root.querySelectorAll('[data-rise=""]'));
      for (const card of cards) {
        if (belowFold(card)) {
          card.dataset.rise = 'pending';
          rise.observe(card);
        } else {
          card.dataset.rise = 'static';
        }
      }
    }

    prepare(document.body);

    const added = new MutationObserver((mutations) => {
      for (const mutation of mutations) mutation.addedNodes.forEach(prepare);
    });
    added.observe(document.body, { childList: true, subtree: true });

    // Undo everything on the way out. Development runs this effect twice, and
    // a card left `pending` with its observer gone would never show.
    return () => {
      added.disconnect();
      rise.disconnect();
      document.querySelectorAll('[data-rise]').forEach((el) => {
        el.dataset.rise = '';
        el.style.removeProperty('--rise-delay');
      });
    };
  }, []);

  return null;
}
