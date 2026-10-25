'use client';

import { useEffect } from 'react';

/**
 * The site's one moment of motion: paintings that hang themselves. As a row of
 * painting cards comes into view, each card — its mat and the painting on it,
 * as one piece — rises into place a beat after the one before it along the
 * row. It happens **every time** a card comes back into view, scrolling down
 * or up, not only on the first visit. Renders nothing.
 *
 * **One moment, deliberately** (25-10-2026). Whole sections used to rise as
 * they scrolled in and every painting faded in as it loaded; together with the
 * page's generous spacing that read as template chrome. Sections are simply
 * there now, and the cards are the only thing that moves on its own.
 *
 * **Nothing depends on this to become visible.** The server renders every card
 * in its final, visible state. This runs only after hydration, and the first
 * screen is left exactly as the server drew it — so with no JavaScript, or a
 * script that fails, the page is simply all there, and nothing on the first
 * screen ever waits. Because the markup is identical on the server and at
 * hydration, there is nothing for React to report as a mismatch.
 *
 * **Two observers, because showing and resetting want different edges.**
 *
 *   - `rise` fires as a card **enters the screen**, so the motion is seen. It
 *     used to fire a quarter of a screen early, and on an ordinary scroll the
 *     rise was over before the card was in view — there, but nobody saw it.
 *   - `reset` puts a card back to `pending` only once it is **well off the
 *     screen**, past RESET_MARGIN in either direction, so it can rise again
 *     next time without ever being seen to drop back.
 *
 * Two rules keep it from feeling slow:
 *
 *   - **The stagger restarts on every row**, so a card waits only for the cards
 *     before it in its own row, never behind the whole grid.
 *   - **No card waits more than MAX_STAGGER_STEPS beats** (300ms), however many
 *     arrive at once — a fast fling, a jump to the footer and back, a gallery
 *     filter. And a waiting card is never invisible: it sits at
 *     --rise-from-opacity, so a jump lands on cards that are there and settling.
 *
 * **A painting fades in once.** If its file has not arrived when its card is
 * shown, it is marked `data-awaiting` and its fade waits for the load — so a
 * slow image is never faded in empty and then popped in again.
 *
 * Under `prefers-reduced-motion: reduce` it does nothing at all.
 *
 * The state is `[data-rise]` on each card (components/ui/ArtworkCard), styled
 * in ArtworkCard.module.css: empty from the server, `static` when it was on
 * the first screen at load, `pending` while off screen and waiting, `shown`
 * once it has come into view. A MutationObserver picks up what arrives later —
 * a client navigation, or a gallery filter, which changes the page without
 * changing its path.
 */

/** The beat between neighbours in a row, and how many beats a card may wait. */
const STAGGER_MS = 100;
const MAX_STAGGER_STEPS = 3;

/** Cards whose tops are this close are one row. */
const ROW_TOLERANCE_PX = 8;

/** How far off screen a card must be before it is set back to rise again. */
const RESET_MARGIN = '30% 0px 30% 0px';

export default function QuietMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (!('IntersectionObserver' in window)) return undefined;

    /** Shows a card's painting once its file is there, and only once. */
    function hang(card) {
      const img = card.querySelector('img');
      if (!img || img.complete) return;
      img.dataset.awaiting = '';
      const done = () => delete img.dataset.awaiting;
      img.addEventListener('load', done, { once: true });
      // A broken image is shown broken rather than left invisible.
      img.addEventListener('error', done, { once: true });
    }

    const rise = new IntersectionObserver((entries) => {
      /*
        Group what arrives into rows by where each card sits, then order each
        row as it is read — along the row in the page's direction, so it rises
        right to left in Hebrew. The beat counts from the start of each row,
        not across the whole batch.
      */
      const rtl = document.documentElement.dir === 'rtl';
      const arriving = entries
        .filter((entry) => entry.isIntersecting && entry.target.dataset.rise === 'pending')
        .map((entry) => ({ el: entry.target, box: entry.boundingClientRect }))
        .sort((a, b) => a.box.top - b.box.top);

      const rows = [];
      for (const card of arriving) {
        const row = rows.at(-1);
        if (row && Math.abs(row[0].box.top - card.box.top) <= ROW_TOLERANCE_PX) row.push(card);
        else rows.push([card]);
      }

      for (const row of rows) {
        row.sort((a, b) => (rtl ? b.box.left - a.box.left : a.box.left - b.box.left));
        row.forEach(({ el }, column) => {
          el.style.setProperty('--rise-delay', `${Math.min(column, MAX_STAGGER_STEPS) * STAGGER_MS}ms`);
          hang(el);
          el.dataset.rise = 'shown';
        });
      }
    });

    const reset = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting && entry.target.dataset.rise !== 'pending') {
            entry.target.dataset.rise = 'pending';
          }
        }
      },
      { rootMargin: RESET_MARGIN }
    );

    // Below the first screen means below it at the moment we look: anything
    // already on screen is left exactly as the server drew it, until it has
    // been scrolled well away and comes back.
    const belowFold = (el) => el.getBoundingClientRect().top > window.innerHeight;

    function prepare(root) {
      if (!(root instanceof Element)) return;

      const cards = root.matches('[data-rise=""]') ? [root] : [];
      cards.push(...root.querySelectorAll('[data-rise=""]'));
      for (const card of cards) {
        card.dataset.rise = belowFold(card) ? 'pending' : 'static';
        rise.observe(card);
        reset.observe(card);
      }
    }

    prepare(document.body);

    const added = new MutationObserver((mutations) => {
      for (const mutation of mutations) mutation.addedNodes.forEach(prepare);
    });
    added.observe(document.body, { childList: true, subtree: true });

    // Undo everything on the way out. Development runs this effect twice, and
    // a card left `pending` with its observers gone would never show.
    return () => {
      added.disconnect();
      rise.disconnect();
      reset.disconnect();
      document.querySelectorAll('[data-rise]').forEach((el) => {
        el.dataset.rise = '';
        el.style.removeProperty('--rise-delay');
      });
      document.querySelectorAll('img[data-awaiting]').forEach((img) => {
        delete img.dataset.awaiting;
      });
    };
  }, []);

  return null;
}
