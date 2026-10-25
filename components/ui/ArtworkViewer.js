'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fullViewLoader } from '@/lib/image-loader';
import { getDirection, getLocaleTag } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { VIEW_INDEX_ATTRIBUTE } from './viewTrigger';
import styles from './ArtworkViewer.module.css';

/**
 * A painting, full screen: the whole work, never cropped, alone on a dark
 * ground so its colour reads true.
 *
 * ## How it is opened, and why the page stays a server component
 *
 * `ArtworkDetail` is a server component and stays one. This wraps it and holds
 * nothing but the dialog; the buttons that open it are **server markup** — a
 * plain button laid over each frame, carrying `VIEW_INDEX_ATTRIBUTE` — and a
 * single click handler here finds the one that was pressed. So no frame, no
 * price and no label is pulled into the browser to make the painting clickable,
 * and the frame itself is untouched: the never-crop rule stays where it lives.
 *
 * ## A native `<dialog>`, opened modally
 *
 * `showModal()` is most of the requirements at once: the page behind it becomes
 * inert, so focus cannot leave; Escape closes it; it is announced as a dialog,
 * named by the work's title through `aria-labelledby`; and it is drawn in the
 * top layer, above the header, the cart drawer and the floating WhatsApp button,
 * with no z-index to keep in step. What it does not do is lock the page's
 * scroll, return focus to the painting that opened it, or know about touch —
 * those three are below.
 *
 * **Its language and direction are set on the dialog itself**, from the locale
 * it is handed, rather than left to whatever wraps it. The admin preview renders
 * the English page inside the admin's Hebrew document; the arrows, the swipe
 * and the keys all turn on that direction, and a view that inherited it would
 * be one wrapper change away from pointing the wrong way exactly where she
 * checks it.
 *
 * ## Two images, one box
 *
 * The box is sized from the original's own pixels before anything loads, so
 * nothing jumps. Inside it the image the page already showed — in the browser's
 * cache, so it appears at once — sits beneath the large file, which fades in
 * over it when it arrives. On a slow phone the alternative is a black screen
 * for as long as the download takes.
 *
 * **The box is never larger than the file.** A 700px original is drawn at 700
 * CSS pixels with ground around it rather than stretched to fill the screen: a
 * smaller painting looks like a smaller painting, and an upscaled one looks
 * like a bad photograph. And the file is never *requested* larger than it is —
 * `fullViewLoader` in lib/image-loader.js caps every width.
 *
 * ## Touch
 *
 * A downward swipe closes it; with more than one image a sideways swipe moves
 * between them, mirrored in Hebrew. **Pinch-to-zoom is the browser's, and left
 * alone**: nothing here sets `touch-action` or calls `preventDefault`, the
 * listeners are passive, a second finger abandons the gesture, and while the
 * page is zoomed in a swipe is panning, so it is not read as one at all.
 *
 * @param {object} props
 * @param {{src: string, width: number, height: number, alt: string}[]} props.images
 *   Main image first, then the supporting ones, in the order the page shows them.
 * @param {string} props.title - The work's title in `locale`; the dialog's name.
 * @param {string} props.dimensions - Its physical size, already formatted.
 * @param {string} props.locale
 * @param {{viewClose: string, viewPrevious: string, viewNext: string, viewPosition: string}} props.copy
 * @param {React.ReactNode} props.children - The artwork body, buttons included.
 */

/** How far a finger must travel before the gesture is read as a swipe at all. */
const SLOP_PX = 10;
/** How far down a swipe must carry the painting to close the view. */
const CLOSE_DISTANCE_PX = 110;
/** How far sideways to move to the next image. */
const STEP_DISTANCE_PX = 70;
/** A quick flick counts whatever its length — px per ms. */
const FLICK_SPEED = 0.45;

/**
 * Whether the visitor has pinched the page in. While they have, one finger
 * moving is them looking around the painting, not asking to leave it.
 */
function isZoomedIn() {
  return (window.visualViewport?.scale ?? 1) > 1.01;
}

/**
 * The image the page already drew for this position, if it drew one — the
 * thumbnail-sized file the browser has in its cache. Read from the DOM at the
 * moment of opening, because which candidate the browser picked is known only
 * there.
 */
function readPagePreview(root, index) {
  const trigger = root?.querySelector('[' + VIEW_INDEX_ATTRIBUTE + '="' + index + '"]');
  const img = trigger?.parentElement?.querySelector('img');
  return img?.currentSrc || null;
}

/**
 * Locks the page behind the view, and returns the function that unlocks it.
 *
 * Hiding the scrollbar widens the page by its width, which on a desktop would
 * shift everything beneath the view sideways as it fades in and out. The body
 * is padded by exactly that width, on the side the scrollbar was on, so
 * nothing moves. **Not `scrollbar-gutter: stable`**, which was tried first: it
 * keeps the gutter by narrowing what a fixed element covers too, and the view
 * stopped 15px short of the screen's edge, a strip of the page showing beside
 * it. Measured on 24-10-2026 in both languages; the side is read rather than
 * assumed, because a browser may put an RTL page's scrollbar on the left.
 *
 * `overscroll-behavior` is what stops a downward swipe on Android being read
 * as pull-to-refresh.
 */
function lockPageScroll() {
  const root = document.documentElement;
  const body = document.body;
  const scrollbar = window.innerWidth - root.clientWidth;
  const side = root.getBoundingClientRect().left > 0 ? 'paddingLeft' : 'paddingRight';
  const previous = {
    overflow: root.style.overflow,
    overscrollBehavior: root.style.overscrollBehavior,
    padding: body.style[side],
  };

  if (scrollbar > 0) body.style[side] = `calc(${getComputedStyle(body)[side]} + ${scrollbar}px)`;
  root.style.overflow = 'hidden';
  root.style.overscrollBehavior = 'none';

  return () => {
    root.style.overflow = previous.overflow;
    root.style.overscrollBehavior = previous.overscrollBehavior;
    body.style[side] = previous.padding;
  };
}

export default function ArtworkViewer({ images, title, dimensions, locale, copy, children }) {
  const rootRef = useRef(null);
  const dialogRef = useRef(null);
  const canvasRef = useRef(null);
  const openerRef = useRef(null);
  const unlockRef = useRef(null);
  const gestureRef = useRef(null);
  /** Set when a swipe travelled, so the click a browser may follow it with is ignored. */
  const swipedRef = useRef(false);

  const titleId = useId();
  const [index, setIndex] = useState(0);
  /**
   * Nothing is downloaded until the view is first opened. After that the
   * images stay mounted, so closing can fade out a painting rather than an
   * empty box, and reopening the same one costs nothing.
   */
  const [activated, setActivated] = useState(false);
  const [preview, setPreview] = useState(null);

  const direction = getDirection(locale);
  const multiple = images.length > 1;

  /* If the page goes away with the view open, the page's scroll comes back. */
  useEffect(() => () => unlockRef.current?.(), []);

  /*
    The cart drawer closes on Escape from anywhere, through a listener on the
    document — and React's own listeners are on the document too, so stopping
    the event from a React handler would not reach the drawer's. A native
    listener on the dialog runs first and keeps Escape here: it means this view,
    and only this view. Stopping propagation leaves the dialog's own close
    alone, which is a default action rather than a listener.
  */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const keepEscape = (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    };
    dialog.addEventListener('keydown', keepEscape);
    return () => dialog.removeEventListener('keydown', keepEscape);
  }, []);

  function show(nextIndex) {
    setIndex(nextIndex);
    setPreview(readPagePreview(rootRef.current, nextIndex));
  }

  function step(delta) {
    show((index + delta + images.length) % images.length);
  }

  function open(nextIndex, opener) {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    openerRef.current = opener;
    show(nextIndex);
    setActivated(true);
    dialog.showModal();
    unlockRef.current = lockPageScroll();
  }

  function close() {
    dialogRef.current?.close();
  }

  /* --- Opening: one listener for every button on the page ------------- */

  function onPageClick(event) {
    const trigger = event.target.closest('[' + VIEW_INDEX_ATTRIBUTE + ']');
    if (!trigger || !rootRef.current?.contains(trigger)) return;
    open(Number(trigger.getAttribute(VIEW_INDEX_ATTRIBUTE)), trigger);
  }

  /* --- Closing --------------------------------------------------------- */

  /**
   * The one place a close is finished, however it was asked for — the button,
   * Escape (which the dialog turns into this event itself), the ground or a
   * swipe — so the page always comes back the same way.
   */
  function onDialogClose() {
    unlockRef.current?.();
    unlockRef.current = null;
    if (canvasRef.current) canvasRef.current.style.transform = '';
    /*
      Browsers now restore focus on their own when a modal dialog closes; this
      is said anyway, because the requirement is that focus lands on the
      painting that opened it, and that is not the platform's promise to keep.
    */
    openerRef.current?.focus();
  }

  /**
   * A tap on the ground closes it; a tap on the painting does not. "Ground" is
   * marked in the markup rather than guessed from geometry, so the caption and
   * every control are simply not on the list.
   */
  function onDialogClick(event) {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    if (event.target === event.currentTarget || event.target.hasAttribute('data-ground')) close();
  }

  function onDialogKeyDown(event) {
    if (!multiple) return;

    /* The next image is the one the reading direction points at. */
    const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) step(1);
    else if (event.key === back) step(-1);
  }

  /* --- Touch ----------------------------------------------------------- */

  function setDrag(transform) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transform = transform;
    if (transform) canvas.setAttribute('data-dragging', '');
    else canvas.removeAttribute('data-dragging');
  }

  function onTouchStart(event) {
    /*
      A second finger landing arrives here, as a new touchstart, not as a move
      — so this is where a swipe already under way is given up and the painting
      put back. Measured: without it the painting stayed 30px down for the
      whole pinch.
    */
    if (event.touches.length > 1) {
      gestureRef.current = null;
      setDrag('');
      return;
    }
    swipedRef.current = false;
    gestureRef.current = isZoomedIn()
      ? null
      : { x: event.touches[0].clientX, y: event.touches[0].clientY, time: event.timeStamp, axis: null };
  }

  function onTouchMove(event) {
    const gesture = gestureRef.current;
    if (!gesture) return;

    /* A second finger is a pinch. Give the gesture up and put the painting back. */
    if (event.touches.length > 1 || isZoomedIn()) {
      gestureRef.current = null;
      setDrag('');
      return;
    }

    const dx = event.touches[0].clientX - gesture.x;
    const dy = event.touches[0].clientY - gesture.y;

    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP_PX) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      /* Sideways means nothing with one image. */
      if (gesture.axis === 'x' && !multiple) {
        gestureRef.current = null;
        return;
      }
    }

    swipedRef.current = true;
    gesture.dx = dx;
    gesture.dy = dy;
    /* The painting follows the finger — down only, since up closes nothing. */
    setDrag(gesture.axis === 'x' ? `translateX(${dx}px)` : `translateY(${Math.max(dy, 0)}px)`);
  }

  function onTouchEnd(event) {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture?.axis) return;

    const elapsed = Math.max(event.timeStamp - gesture.time, 1);

    if (gesture.axis === 'y') {
      const dy = gesture.dy ?? 0;
      if (dy > CLOSE_DISTANCE_PX || (dy > SLOP_PX * 3 && dy / elapsed > FLICK_SPEED)) {
        close();
        return;
      }
    } else {
      const dx = gesture.dx ?? 0;
      if (Math.abs(dx) > STEP_DISTANCE_PX || Math.abs(dx) / elapsed > FLICK_SPEED) {
        /*
          A finger moving towards the inline start pulls the next image in:
          leftwards in English, rightwards in Hebrew.
        */
        const towardsStart = direction === 'rtl' ? dx > 0 : dx < 0;
        setDrag('');
        step(towardsStart ? 1 : -1);
        return;
      }
    }

    setDrag('');
  }

  /* --- Rendering ------------------------------------------------------- */

  if (images.length === 0) return children;

  const image = images[index];
  const ratio = image.width / image.height;
  /*
    What the box is drawn at, said to the browser so it picks the right file:
    no wider than the original, the screen, or the screen's height at the
    work's shape. A deliberate over-estimate — the bars take a little height —
    which costs a slightly larger file and never a soft painting.
  */
  const sizes = `min(${image.width}px, 100vw, ${Math.ceil(ratio * 100)}vh)`;

  const PreviousIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = direction === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div ref={rootRef} onClick={onPageClick}>
      {children}

      <dialog
        ref={dialogRef}
        className={styles.viewer}
        aria-labelledby={titleId}
        dir={direction}
        lang={getLocaleTag(locale)}
        onClose={onDialogClose}
        onClick={onDialogClick}
        onKeyDown={onDialogKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className={styles.top} data-ground="">
          {multiple ? (
            <p className={styles.position}>
              <bdi>
                {interpolate(copy.viewPosition, { current: index + 1, total: images.length })}
              </bdi>
            </p>
          ) : null}

          {/* First in the dialog, so it is where showModal() puts focus. */}
          <button
            type="button"
            className={[styles.control, styles.close].join(' ')}
            onClick={close}
            aria-label={copy.viewClose}
          >
            <X size={22} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.stage} data-ground="">
          {activated ? (
            <div
              key={index}
              ref={canvasRef}
              className={styles.canvas}
              style={{
                '--view-ratio': ratio,
                '--view-width': image.width + 'px',
              }}
            >
              {preview ? (
                <Image
                  className={styles.preview}
                  src={preview}
                  width={image.width}
                  height={image.height}
                  alt=""
                  aria-hidden="true"
                  /* Already a delivery URL the page fetched; asking again would fetch it twice. */
                  unoptimized
                />
              ) : null}
              <Image
                className={styles.painting}
                src={image.src}
                width={image.width}
                height={image.height}
                alt={image.alt}
                sizes={sizes}
                loader={fullViewLoader(image.width)}
                loading="eager"
                onLoad={(event) => event.currentTarget.setAttribute('data-loaded', '')}
              />
            </div>
          ) : null}
        </div>

        <div className={styles.bottom} data-ground="">
          {multiple ? (
            <button type="button" className={styles.control} onClick={() => step(-1)} aria-label={copy.viewPrevious}>
              <PreviousIcon size={22} strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : null}

          {/*
            The wall label, cut to the two facts a full-screen view loses: what
            the work is, and how big it really is. A painting filling a phone
            and the same painting filling a monitor are both "full size", and
            neither says whether it is 30 or 90 centimetres across.
          */}
          <div className={styles.caption}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {dimensions ? (
              <p className={styles.dimensions}>
                <bdi>{dimensions}</bdi>
              </p>
            ) : null}
          </div>

          {multiple ? (
            <button type="button" className={styles.control} onClick={() => step(1)} aria-label={copy.viewNext}>
              <NextIcon size={22} strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
