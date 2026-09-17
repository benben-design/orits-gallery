'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
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
 *
 * ## The stop control, which is a Level A requirement rather than a courtesy
 *
 * WCAG 2.2.2 — and so IS 5568 at level AA, which contains it — asks that
 * anything which moves automatically, lasts more than five seconds and sits
 * alongside other content can be paused, stopped or hidden. This loop is
 * automatic and infinite and it is the first screen of the site.
 *
 * **Honouring `prefers-reduced-motion` does not satisfy it**, and that is the
 * reason this control exists rather than a second media query. The criterion
 * asks for a mechanism *in the page*: a visitor whose operating system says
 * nothing about motion — because they never found the setting, because they are
 * on a borrowed machine, or because they want this one video stopped and not
 * every animation everywhere — has no way to act on an OS preference. The
 * media query answers a different question, and both answers are needed.
 *
 * Three properties of it are deliberate:
 *
 *   - **It is rendered only when the video is.** Under reduced motion or
 *     Save-Data this component returns null, so nothing moves and there is
 *     nothing to offer a control over — the hero is the still, which is a
 *     complete design rather than a degraded one.
 *   - **Stopping uncovers the poster** instead of freezing the loop where it
 *     stood. `canPlay && playing` is what draws the video, so pausing hands the
 *     frame back to the still underneath — a composed picture rather than
 *     whichever blur the pause landed on. Nothing unmounts, so resuming is
 *     instant and the download is not repeated.
 *   - **The label is the next action**, swapping between "stop" and "play",
 *     rather than a pressed state on a control whose name never changes.
 */
export default function HeroVideo({ src, pauseLabel, playLabel, className = '' }) {
  /* Starts false so the server render and the first client render agree. */
  const [mounted, setMounted] = useState(false);
  const [canPlay, setCanPlay] = useState(false);

  /*
    Whether the loop should be running. It starts true because the video is
    only ever mounted in the case where motion is welcome — the reduced-motion
    and Save-Data visitors never reach this component at all.
  */
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef(null);

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

  /**
   * Drive the element, then record what we asked for.
   *
   * `play()` returns a promise that can reject — the browser is entitled to
   * refuse. It will not here, because this only ever runs from a click or a
   * key press, but a refusal that left the button saying "stop" over a still
   * frame would be a control lying about the state of the page, so the state
   * follows the element rather than the intent.
   */
  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      video.pause();
      setPlaying(false);
      return;
    }

    setPlaying(true);
    video.play().catch(() => setPlaying(false));
  };

  return (
    <>
      <video
        ref={videoRef}
        className={[styles.video, canPlay && playing ? styles.visible : '', className]
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
        onLoadedData={() => setCanPlay(true)}
        onCanPlay={() => setCanPlay(true)}
        /*
          The element's own state, not ours, so anything that stops the video
          without going through the button — the browser suspending it in a
          background tab, or a media key — leaves the control saying the truth.
        */
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        /**
         * The poster underneath already carries the description, and this is the
         * same scene in motion. Announcing it twice would be noise, so it is
         * hidden from assistive technology and taken out of the tab order.
         */
        aria-hidden="true"
        tabIndex={-1}
      />

      {/*
        An ordinary button: reachable in the tab order, operable with Enter and
        Space, and carrying the site's own focus ring from app/globals.css. It
        is always visible rather than appearing on hover — a control that needs
        a pointer to find is no control at all on a phone, and none for someone
        who cannot see it happen.
      */}
      <button
        type="button"
        className={styles.control}
        onClick={toggle}
      >
        {playing ? (
          <Pause size={14} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Play size={14} strokeWidth={1.5} aria-hidden="true" />
        )}
        <span>{playing ? pauseLabel : playLabel}</span>
      </button>
    </>
  );
}
