'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import StatusBadge from '@/components/ui/StatusBadge';
import Price from '@/components/ui/Price';
import { getStatusPresentation, isBuyable } from '@/components/ui/statusPresentation';
import { useCart } from './cart-context';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatPrice } from '@/lib/format';
import { MAX_CART_ITEMS } from '@/lib/cart/cart-contents';
import styles from './CartDrawer.module.css';

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
 */
export default function CartDrawer({ dictionary, locale }) {
  const { open, contents, notice, pending, closeCart, removeWork, clearMissing } = useCart();
  const closeRef = useRef(null);

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
      className={[styles.panel, open ? styles.open : ''].filter(Boolean).join(' ')}
      role="dialog"
      aria-label={dictionary.cart.drawerTitle}
      /* Hidden from tab order and from assistive technology while shut. */
      aria-hidden={open ? undefined : 'true'}
    >
      <div className={styles.top}>
        <h2 className={styles.title}>{dictionary.cart.drawerTitle}</h2>
        <button ref={closeRef} type="button" className={styles.close} onClick={closeCart}>
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>{dictionary.cart.close}</span>
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
                  {dictionary.cart.remove}
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
              {dictionary.cart.removeMissing}
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
          The checkout control. **It deliberately does nothing yet**: checkout is
          not built and no payment provider is chosen, and it is here so the flow
          can be shown end to end. `aria-disabled` rather than nothing at all —
          it looks exactly as it will when it works, but a screen reader is not
          told it leads somewhere. See commerce.md.
        */}
        <button type="button" className={styles.checkout} aria-disabled="true">
          {dictionary.cart.checkout}
        </button>

        <Link href={localeHref(locale, '/cart')} className={styles.viewCart} onClick={closeCart}>
          {dictionary.cart.viewCart}
        </Link>
      </div>
    </div>
  );
}
