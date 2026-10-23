'use client';

import { useEffect } from 'react';

/**
 * The site's small amount of motion: sections below the first screen rise
 * into place as they scroll into view, once, and paintings fade in as they
 * load rather than popping. Renders nothing.
 *
 * **Nothing depends on this to become visible.** The server renders every
 * section and every painting in its final, visible state. This runs only
 * after hydration, and only then hides what is still *below* the first screen
 * — so with no JavaScript, or a script that fails, the page is simply all
 * there, and nothing on the first screen ever waits (the hero is the largest
 * paint). Because the markup is identical on the server and at hydration,
 * there is nothing for React to report as a mismatch.
 *
 * Under `prefers-reduced-motion: reduce` it does nothing at all.
 *
 * The states are data attributes, styled where the elements are:
 *   - `[data-reveal]` on every <Section> → `pending`, then `shown`
 *     (components/ui/Section.module.css)
 *   - `[data-painting]` on every painting → `data-loading` until it loads
 *     (components/ui/ArtworkFrame.module.css)
 *
 * A MutationObserver picks up what arrives later — a client navigation, or a
 * gallery filter, which changes the page without changing its path.
 */
export default function QuietMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (!('IntersectionObserver' in window)) return undefined;

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.dataset.reveal = 'shown';
          reveal.unobserve(entry.target);
        }
      },
      // A little before the section's top reaches the bottom edge, so the
      // rise is under way as it comes into view rather than after.
      { rootMargin: '0px 0px -8% 0px' }
    );

    // Below the first screen means below it at the moment we look: a page
    // restored mid-scroll keeps whatever is already in view exactly as it is.
    const belowFold = (el) => el.getBoundingClientRect().top > window.innerHeight;

    function prepare(root) {
      if (!(root instanceof Element)) return;

      const sections = root.matches('[data-reveal=""]') ? [root] : [];
      sections.push(...root.querySelectorAll('[data-reveal=""]'));
      for (const section of sections) {
        if (belowFold(section)) {
          section.dataset.reveal = 'pending';
          reveal.observe(section);
        } else {
          section.dataset.reveal = 'static';
        }
      }

      const paintings = root.matches('img[data-painting]') ? [root] : [];
      paintings.push(...root.querySelectorAll('img[data-painting]:not([data-seen])'));
      for (const img of paintings) {
        img.dataset.seen = '';
        if (img.complete || !belowFold(img)) continue;
        img.dataset.loading = '';
        const done = () => delete img.dataset.loading;
        img.addEventListener('load', done, { once: true });
        // A broken image is shown broken rather than left invisible.
        img.addEventListener('error', done, { once: true });
      }
    }

    prepare(document.body);

    const added = new MutationObserver((mutations) => {
      for (const mutation of mutations) mutation.addedNodes.forEach(prepare);
    });
    added.observe(document.body, { childList: true, subtree: true });

    // Undo everything on the way out. Development runs this effect twice, and
    // a section left `pending` with its observer gone would never show.
    return () => {
      added.disconnect();
      reveal.disconnect();
      document.querySelectorAll('[data-reveal]').forEach((el) => { el.dataset.reveal = ''; });
      document.querySelectorAll('img[data-seen]').forEach((img) => {
        delete img.dataset.seen;
        delete img.dataset.loading;
      });
    };
  }, []);

  return null;
}
