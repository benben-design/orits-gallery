'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Trash2, CreditCard } from 'lucide-react';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import StatusBadge from '@/components/ui/StatusBadge';
import Price from '@/components/ui/Price';
import { getStatusPresentation, isBuyable } from '@/components/ui/statusPresentation';
import { useCart } from './cart-context';
import { localeHref, getDirection } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatPrice } from '@/lib/format';
import { MAX_CART_ITEMS } from '@/lib/cart/cart-contents';
import styles from './CartDrawer.module.css';

/** How far across the panel a drag must get before letting go closes it. */
const DRAG_CLOSE_FRACTION = 0.35;

/** Movement before a press is treated as a drag rather than a click. */
const DRAG_CLAIM_PX = 8;

/** A flick this fast closes whatever distance it covered, in px per ms. */
const DRAG_FLICK_VELOCITY = 0.5;

/**
 * The cart, as a panel that slides in from the edge of the screen.
 *
 * **It is the primary cart now**; `/cart` is still built and still the whole
 * page, reached from the button at the foot of this panel. That split is
 * deliberate — the drawer is for "what have I picked", the page is for reading
 * the list properly, and the page is the one that will grow a checkout.
 *
 * **No overlay behind it**, which is a decision rather than an omission: the
 * page stays visible and usable, so adding a painting does not interrupt
 * browsing. It also means this is not a modal, so there is no focus trap and
 * nothing is hidden from assistive technology — `aria-modal` is deliberately
 * absent rather than set to a value that would not be true.
 *
 * The keyboard is still handled properly: opening moves focus into the panel,
 * Escape closes it, and closing returns focus to whatever opened it.
 *
 * **It is always in the DOM**, hidden with a transform rather than unmounted,
 * so the slide has something to animate from and the panel does not appear
 * fully formed at the edge. `visibility` is what keeps it off the tab order
 * while closed — `transform` alone leaves it focusable off-screen, which is how
 * a keyboard user ends up somewhere they cannot see.
 *
 * **It can also be pushed shut with a finger or the mouse**, which is the
 * gesture a panel like this is expected to answer on a phone. Four things make
 * that safe to add rather than a source of accidents:
 *
 *   - **It follows the writing direction.** The panel is pinned to the inline
 *     end, so it dismisses towards the left in Hebrew and the right in English.
 *     The sign comes from `getDirection(locale)`, the same source `dir` does,
 *     rather than from reading the DOM.
 *   - **A gesture is not claimed until it has proved itself horizontal.** The
 *     body of the panel scrolls, and a drag that moves further down than across
 *     is abandoned so the scroll happens instead — `touch-action: pan-y` in the
 *     stylesheet tells the browser the same thing.
 *   - **A press that never moves is still a click.** Nothing is captured until
 *     the threshold is passed, so the buttons and links inside go on working.
 *   - **It closes on distance or on speed**, because a slow drag most of the
 *     way and a quick flick are both people saying the same thing. Anything
 *     short of either springs back.
 */
export default function CartDrawer({ dictionary, locale }) {
  const { open, contents, notice, pending, closeCart, removeWork, clearMissing } = useCart();
  const closeRef = useRef(null);
  const panelRef = useRef(null);

  /*
    The live gesture, in a ref rather than state: it changes on every pointer
    move and none of it should cause a render. Only `dragOffset` does, because
    only that is drawn.
  */
  const gesture = useRef(null);
  const [dragOffset, setDragOffset] = useState(null);

  /*
    Which way "away" is. The panel is pinned to the inline end, so it leaves
    towards the left in Hebrew and the right in English — the same direction
    `--drawer-hidden-shift` sends it when it closes on its own.
  */
  const closingSign = getDirection(locale) === 'rtl' ? -1 : 1;

  /* Escape closes, from anywhere — the panel does not hold focus captive. */
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeCart();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeCart]);

  /**
   * Opening puts the keyboard inside the panel rather than leaving it behind.
   *
   * **Two frames later, not immediately**, and that is measured rather than
   * superstition. The panel is `visibility: hidden` while closed, and an
   * element whose computed visibility has not yet been recalculated cannot take
   * focus: `.focus()` returns silently and the keyboard stays on `<body>`. One
   * frame was not enough either — the same probe still found focus on the body.
   * Two guarantees a style recalculation has happened in between.
   *
   * Focus moves *into* the panel even though this is not a modal. Without it a
   * keyboard user would have to tab through the whole page to reach a cart they
   * just opened.
   */
  useEffect(() => {
    if (!open) return undefined;

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => closeRef.current?.focus());
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open]);

  /*
    A drag only moves the panel while the panel is open, which is what makes a
    reset effect unnecessary — and an effect here would set state during render
    and cascade. If something else closes the drawer mid-drag (Escape is the
    real case), `open` goes false, the inline transform stops being applied and
    the panel leaves under its own transition; the offset that is still in state
    is cleared by the pointerup or pointercancel that follows, and is never read
    in between.
  */
  const dragging = open && dragOffset !== null;

  const endGesture = () => {
    gesture.current = null;
    setDragOffset(null);
  };

  const onPointerDown = (event) => {
    /* Secondary mouse buttons open menus; they do not drag panels. */
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      claimed: false,
    };
  };

  const onPointerMove = (event) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    if (!active.claimed) {
      if (Math.abs(dx) < DRAG_CLAIM_PX && Math.abs(dy) < DRAG_CLAIM_PX) return;

      /*
        Further down than across: this is the body being scrolled, not the panel
        being pushed away. Let go of it entirely rather than fighting the scroll.
      */
      if (Math.abs(dy) >= Math.abs(dx)) {
        gesture.current = null;
        return;
      }

      active.claimed = true;
      /* From here the pointer belongs to the panel, so a drag off it still ends. */
      panelRef.current?.setPointerCapture(event.pointerId);
    }

    /* Only movement *away* moves the panel; pulling it further open does nothing. */
    setDragOffset(Math.max(0, dx * closingSign));
  };

  const onPointerUp = (event) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    if (!active.claimed) {
      endGesture();
      return;
    }

    const travelled = Math.max(0, (event.clientX - active.startX) * closingSign);
    const width = panelRef.current?.offsetWidth ?? 0;
    const elapsed = Math.max(1, event.timeStamp - active.startedAt);

    const farEnough = width > 0 && travelled > width * DRAG_CLOSE_FRACTION;
    const fastEnough = travelled / elapsed > DRAG_FLICK_VELOCITY;

    /*
      Clearing the offset first hands the panel back to the stylesheet, so it
      either springs home or carries on out under the same transition rather
      than jumping between an inline transform and a class.
    */
    endGesture();
    if (farEnough || fastEnough) closeCart();
  };

  const works = contents?.works ?? [];
  const total = contents?.total ?? null;
  const missingCount = contents?.missingCount ?? 0;

  /* Nothing has been read back yet — the first open, mid-flight. */
  const loading = contents === null && pending;

  const noticeText =
    notice === 'unavailable'
      ? dictionary.cart.noticeUnavailable
      : notice === 'full'
        ? interpolate(dictionary.cart.noticeFull, { count: MAX_CART_ITEMS })
        : null;

  return (
    <div
      ref={panelRef}
      className={[styles.panel, open ? styles.open : '', dragging ? styles.dragging : '']
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-label={dictionary.cart.drawerTitle}
      /* Hidden from tab order and from assistive technology while shut. */
      aria-hidden={open ? undefined : 'true'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endGesture}
      /*
        While a drag is live the panel follows the finger exactly, so the
        transition is off — with it on, every move would be chasing a 420ms
        animation and the panel would lag behind the pointer. Letting go removes
        both and the stylesheet takes it from there.
      */
      style={
        dragging
          ? { transform: `translateX(${closingSign * dragOffset}px)`, transition: 'none' }
          : undefined
      }
    >
      {/*
        The grip: the only thing that says the panel can be pushed shut, since a
        gesture leaves no trace on the page. Purely a sign — the drag is handled
        on the panel as a whole, so this is `aria-hidden` and takes no focus.
        Nothing depends on it: Escape and the close button are the routes that
        work from a keyboard, and this offers a mouse and a thumb the third.
      */}
      <span className={styles.grip} aria-hidden="true" />

      <div className={styles.top}>
        <h2 className={styles.title}>{dictionary.cart.drawerTitle}</h2>
        {/*
          The glyph alone, with the wording carried as the accessible name. A
          close control is the one place an icon needs no label beside it: the
          ✕ is unambiguous, it is where every panel puts it, and the word
          repeated next to it was reading as a second thing to decide. Nothing
          is lost to a screen reader, which announces `aria-label`.
        */}
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          onClick={closeCart}
          aria-label={dictionary.cart.close}
        >
          <X size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.body}>
        {noticeText ? (
          <p className={styles.notice} role="alert">
            {noticeText}
          </p>
        ) : null}

        {loading ? <p className={styles.muted}>{dictionary.cart.loading}</p> : null}

        {!loading && works.length === 0 && missingCount === 0 ? (
          <p className={styles.muted}>{dictionary.cart.empty}</p>
        ) : null}

        {works.map((work) => {
          const title = work.title[locale];
          const available = isBuyable(work.status);
          const mainImage = work.images.find((image) => image.type === 'main') ?? work.images[0];

          return (
            <article
              key={work.id}
              className={[styles.item, available ? '' : styles.unavailable].filter(Boolean).join(' ')}
            >
              {/*
                The frame, so a painting is never cropped even at this size, and
                the mounted tone — several small works warm on warm each need
                their own edge. See images.md.
              */}
              <Link
                href={localeHref(locale, `/art/${work.slug[locale]}`)}
                className={styles.thumbnail}
                onClick={closeCart}
                tabIndex={-1}
                aria-hidden="true"
              >
                <ArtworkFrame
                  image={mainImage}
                  alt=""
                  emptyLabel={dictionary.artwork.noImage}
                  sizes="4rem"
                />
              </Link>

              <div className={styles.itemText}>
                <h3 className={styles.itemTitle}>
                  <Link
                    href={localeHref(locale, `/art/${work.slug[locale]}`)}
                    className={styles.itemLink}
                    onClick={closeCart}
                  >
                    {title}
                  </Link>
                </h3>

                <p className={styles.itemMeta}>
                  <Price
                    price={work.price}
                    locale={locale}
                    dictionary={dictionary}
                    isPlaceholder={work.hasPlaceholderData}
                    status={work.status}
                  />
                  {getStatusPresentation(work.status).badge ? (
                    <StatusBadge status={work.status} dictionary={dictionary} />
                  ) : null}
                </p>

                {available ? null : (
                  <p className={styles.itemNote}>{dictionary.cart.unavailableNote}</p>
                )}

                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => removeWork(work.id)}
                  aria-label={interpolate(dictionary.cart.removeLabel, { title })}
                >
                  <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  <span>{dictionary.cart.remove}</span>
                </button>
              </div>
            </article>
          );
        })}

        {missingCount > 0 ? (
          /*
            Paintings that no longer resolve to anything public. They cannot be
            named, so they are counted, and one control clears all of them.
          */
          <div className={styles.missing}>
            <p className={styles.missingCount}>
              {interpolate(dictionary.cart.missingCount, { count: missingCount })}
            </p>
            <button type="button" className={styles.missingAction} onClick={clearMissing}>
              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>{dictionary.cart.removeMissing}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.bottom}>
        {total ? (
          <p className={styles.totalRow}>
            <span className={styles.totalLabel}>{dictionary.cart.total}</span>
            <span className={styles.totalAmount}>
              <bdi>{formatPrice(total, locale)}</bdi>
            </span>
          </p>
        ) : null}

        {/*
          The checkout control, and **a real link now that there is a checkout**.
          It was an inert `<button>` carrying `aria-disabled` for as long as there
          was nowhere to go; it looks exactly the same, because it always looked
          the way it would when it worked.

          It closes the drawer on the way, like the link below it: this is a
          navigation, and a panel left hanging open over the page somebody has just
          navigated to is the drawer forgetting what it is for.
        */}
        <Link
          href={localeHref(locale, '/checkout')}
          className={styles.checkout}
          onClick={closeCart}
        >
          <CreditCard size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>{dictionary.cart.checkout}</span>
        </Link>

        <Link href={localeHref(locale, '/cart')} className={styles.viewCart} onClick={closeCart}>
          {dictionary.cart.viewCart}
        </Link>
      </div>
    </div>
  );
}
