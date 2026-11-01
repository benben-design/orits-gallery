'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDirection } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { VIEW_CLOSED_EVENT, VIEW_INDEX_ATTRIBUTE } from './viewTrigger';
import styles from './ArtworkGallery.module.css';

/** How long after a swipe a click is taken to be the one the swipe produced. */
const SWIPE_CLICK_WINDOW_MS = 400;

/** How far a finger has to travel sideways before it is a swipe, not a tap. */
const SWIPE_DISTANCE = 40;

/**
 * Browsing a work's images on its own page — rendered only when it has more
 * than one, so a work with just its main image is exactly what it was.
 *
 * **Closer to a museum catalogue than a carousel.** One image on a stage, a
 * strip of small thumbnails beneath it with the current one marked by a
 * hairline, a quiet previous and next at the ends of that strip and "2 of 3"
 * between them. Nothing is laid over the painting, nothing moves by itself,
 * and the change is a short fade rather than a slide.
 *
 * **The stage keeps one footprint**: the main painting's own shape, the plate
 * the page always had. Every image is fitted inside it at its own ratio and
 * never cropped — a landscape detail inside a portrait painting's stage hangs
 * smaller, with wall around it — so nothing below the stage moves when the
 * image changes. That fitting is ArtworkFrame's; this only chooses which one
 * shows.
 *
 * **The images themselves are server markup**, passed in as `slides` and
 * `thumbs`, so the frames, the never-crop rule and the full-screen buttons
 * stay on the server; this holds the one number that changes. Images that are
 * not showing are `hidden`, which is what keeps a lazy one from loading until
 * it is first chosen — the main image keeps its priority.
 *
 * **Directions follow the reading.** In Hebrew "next" sits at the inline end,
 * which is the left, and points left; a swipe towards the start of the line
 * moves forward, and the arrow keys do the same. The arrow keys work while the
 * gallery has focus — Tab into it and ← / → browse — and nowhere else, so the
 * rest of the page keeps them.
 *
 * **The full-screen view browses the same set**, opened by the button over the
 * image showing. When it closes on a different image, it says so with
 * `VIEW_CLOSED_EVENT`, and the stage moves to that image and takes focus back.
 */
export default function ArtworkGallery({ slides, thumbs, locale, copy, className = '' }) {
  const [current, setCurrent] = useState(0);
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  /** When the last swipe ended, so the click a browser may follow it with is ignored. */
  const swipedAtRef = useRef(0);
  /** Set when the full-screen view closed on another image: focus its button once shown. */
  const focusAfterRef = useRef(null);

  const total = slides.length;
  const rtl = getDirection(locale) === 'rtl';
  const PreviousIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;

  function step(delta) {
    setCurrent((index) => (index + delta + total) % total);
  }

  /* --- The full-screen view, closing on another image ------------------ */

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onViewClosed = (event) => {
      const index = Number(event.detail?.index);
      if (!Number.isInteger(index) || index < 0 || index >= total) return;
      focusAfterRef.current = index;
      setCurrent(index);
    };
    root.addEventListener(VIEW_CLOSED_EVENT, onViewClosed);
    return () => root.removeEventListener(VIEW_CLOSED_EVENT, onViewClosed);
  }, [total]);

  useEffect(() => {
    if (focusAfterRef.current !== current) return;
    focusAfterRef.current = null;
    rootRef.current?.querySelector('[' + VIEW_INDEX_ATTRIBUTE + '="' + current + '"]')?.focus();
  }, [current]);

  /* --- Keys, while the gallery has focus -------------------------------- */

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key !== forward && event.key !== back) return;
    event.preventDefault();
    step(event.key === forward ? 1 : -1);
  }

  /* --- Swipe on the stage ------------------------------------------------ */

  function onTouchStart(event) {
    if (event.touches.length !== 1) {
      gestureRef.current = null;
      return;
    }
    const touch = event.touches[0];
    gestureRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event) {
    const start = gestureRef.current;
    gestureRef.current = null;
    if (!start) return;
    // Pinched in, one finger is looking around the image rather than leaving it.
    if ((window.visualViewport?.scale ?? 1) > 1.01) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    swipedAtRef.current = Date.now();
    // Towards the start of the line is forward: leftwards in English, rightwards in Hebrew.
    const towardsStart = rtl ? dx > 0 : dx < 0;
    step(towardsStart ? 1 : -1);
  }

  /*
    A swipe ends on the button that opens the full-screen view, and a browser
    may follow it with a click. Caught here, before the view's own handler on
    an ancestor sees it — but only just after a swipe: a browser that sends no
    such click must not have the next real one swallowed instead.
  */
  function onClickCapture(event) {
    if (Date.now() - swipedAtRef.current > SWIPE_CLICK_WINDOW_MS) return;
    swipedAtRef.current = 0;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      ref={rootRef}
      className={[styles.gallery, className].filter(Boolean).join(' ')}
      role="group"
      aria-label={copy.galleryLabel}
      onKeyDown={onKeyDown}
    >
      <div
        className={styles.stage}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
      >
        {slides.map((slide, index) => (
          <div key={index} className={styles.slide} hidden={index !== current}>
            {slide}
          </div>
        ))}
      </div>

      <div className={styles.strip}>
        <button
          type="button"
          className={styles.step}
          onClick={() => step(-1)}
          aria-label={copy.viewPrevious}
        >
          <PreviousIcon size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>

        <ul className={styles.thumbs}>
          {thumbs.map((thumb, index) => (
            <li key={index} className={styles.thumb}>
              {thumb}
              {/*
                A sibling laid over the frame rather than a wrapper: the frame
                is a run of divs, which a button may not contain.
              */}
              <button
                type="button"
                className={styles.thumbButton}
                onClick={() => setCurrent(index)}
                aria-label={interpolate(copy.galleryShow, { current: index + 1, total })}
                aria-current={index === current ? 'true' : undefined}
              />
            </li>
          ))}
        </ul>

        <p className={styles.position} aria-live="polite">
          {interpolate(copy.viewPosition, { current: current + 1, total })}
        </p>

        <button
          type="button"
          className={styles.step}
          onClick={() => step(1)}
          aria-label={copy.viewNext}
        >
          <NextIcon size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
