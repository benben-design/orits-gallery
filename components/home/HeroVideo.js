'use client';

import { useEffect, useState } from 'react';
import styles from './HeroVideo.module.css';

/**
 * The hero's studio loop — the second client component on the site, and the
 * only one above the fold.
 *
 * It renders the <video> and nothing else. The poster still is server-rendered
 * by Hero.js as a normal next/image, so the largest-contentful-paint element
 * never waits for JavaScript, for hydration, or for this component to decide
 * anything. If the video never arrives — slow link, old browser, JS disabled —
 * the hero is simply the still, which is a complete design rather than a
 * fallback.
 *
 * That split is the whole point. An autoplaying <video> placed directly in the
 * markup is the single most reliable way to ruin mobile LCP: video cannot be
 * preloaded, and the browser will prioritise it over the resources the first
 * paint actually needs. Most visitors here arrive on a phone from Instagram, so
 * that is the exact case being protected.
 *
 * Three conditions skip the video entirely and leave the poster alone:
 *
 *   1. prefers-reduced-motion — an accessibility requirement, not a nicety.
 *   2. Save-Data — the visitor has asked their browser to spend less.
 *   3. Nothing has finished loading yet — the loop waits for the page to go
 *      quiet before it competes for bandwidth.
 *
 * Deliberately NOT checked: navigator.connection.effectiveType. Safari does not
 * implement the Network Information API at all, so a connection-speed test
 * fires nowhere on iPhone — precisely the device it would exist to protect.
 * Checking it would read as thorough while doing nothing.
 */
export default function HeroVideo({ src, className = '' }) {
  /* Starts false so the server render and the first client render agree. */
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* connection is absent on Safari; optional chaining keeps that a no-op. */
    const saveData = navigator.connection?.saveData === true;
    if (reducedMotion || saveData) return;

    /**
     * Yield once more so the loop never lands inside the first paint.
     *
     * These two schedulers are NOT interchangeable and must not be collapsed
     * into one call: requestIdleCallback's second argument is an options
     * object, setTimeout's is a number of milliseconds. Their ids also come
     * from separate pools, so each has to be cancelled by its own canceller.
     */
    let cancelScheduled = () => {};

    const start = () => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => setMounted(true), { timeout: 1000 });
        cancelScheduled = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(() => setMounted(true), 200);
        cancelScheduled = () => window.clearTimeout(id);
      }
    };

    if (document.readyState === 'complete') {
      start();
    } else {
      window.addEventListener('load', start, { once: true });
    }

    return () => {
      window.removeEventListener('load', start);
      cancelScheduled();
    };
  }, []);

  if (!mounted) return null;

  return (
    <video
      className={[styles.video, visible ? styles.visible : '', className]
        .filter(Boolean)
        .join(' ')}
      src={src}
      /* muted and playsInline are both required for autoplay to be allowed. */
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      /**
       * Two triggers for one state, deliberately. Whichever fires first wins
       * and the setter is idempotent — a cached video can reach a playable
       * readyState before React attaches these, and a loop stuck at opacity 0
       * is indistinguishable from a broken one.
       */
      onLoadedData={() => setVisible(true)}
      onCanPlay={() => setVisible(true)}
      /**
       * The poster underneath already carries the description, and this is the
       * same scene in motion. Announcing it twice would be noise, so it is
       * hidden from assistive technology and taken out of the tab order.
       */
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
