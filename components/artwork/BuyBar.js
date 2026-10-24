'use client';

import { useEffect, useRef, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import Price from '@/components/ui/Price';
import { useOptionalCart } from '@/components/cart/cart-context';
import { interpolate } from '@/lib/i18n/interpolate';
import { BUY_CONTROLS_ATTRIBUTE, BUY_BAR_ATTRIBUTE } from './buyControls';
import styles from './BuyBar.module.css';

/**
 * The buy controls again, on a phone, once the real ones have scrolled away.
 *
 * On a phone the painting comes first and the buttons sit under it, its label
 * and its description — and a visitor still reading "more works" or the
 * description has left them behind. This is a slim bar fixed to the foot of the
 * screen with the work's title, its price and the same "add to cart", which
 * slides in **once the original controls have scrolled out of view above**, and
 * away again when they come back. Before they are reached it stays put: the
 * title and the price are on the first screen already, under the painting, and
 * a bar repeating them there would be noise.
 *
 * **Below 60rem only**, the width at which the page stops setting the painting
 * beside its label (ArtworkDetail.module.css); above it, the controls are never
 * far from anything. **Rendered by the public route alone, and only for a work
 * that can be bought** — the admin preview never sees it, by construction.
 *
 * ## What else moves while it shows
 *
 * Nothing here moves anything else in script. The bar says whether it is
 * showing in `BUY_BAR_ATTRIBUTE`, and the floating WhatsApp button's own
 * stylesheet rises above it by `--buy-bar-height` while it does. The page keeps
 * that much room at its foot whenever the bar exists — not only while it shows
 * — because at the end of the page it is always showing anyway, and room that
 * opened and closed with it would only jolt the page as it arrived.
 *
 * The full-screen view hides it (`html:has(dialog[open])`, in the stylesheet),
 * and the cart drawer sits above it: the drawer is z-index 100, this 25 — above
 * the sticky header's 20 and below the WhatsApp button's 30, which is never
 * over it anyway.
 *
 * **Hidden means inert**, so a keyboard never tabs into a bar nobody can see.
 *
 * Its title is a button back up to the painting: the one other thing a visitor
 * at the foot of a long page might want from it.
 *
 * @param {object} props
 * @param {{id: string, title: string, price: object, status: string, isPlaceholder: boolean}} props.work
 * @param {string} props.locale
 * @param {{price: object, status: object}} props.priceCopy - The two dictionary slices `Price` reads.
 * @param {{addToCart: string, backToPainting: string}} props.copy
 */
export default function BuyBar({ work, locale, priceCopy, copy }) {
  const cart = useOptionalCart();
  const buttonRef = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const controls = document.querySelector('[' + BUY_CONTROLS_ATTRIBUTE + ']');
    if (!controls) return undefined;

    /*
      Shown only while the controls are off screen *above* — passed, not yet
      to come — and that takes two observers, not one.

      An observer reports a change of state, and "off screen below" to "off
      screen above" is no change at all for one watching the screen: both are
      "not intersecting". A jump straight past the controls — a fling, an
      anchor, the end key — left the bar hidden while they sat 400px above
      (measured on 24-10-2026). So a second observer watches a root stretched
      far upward, which the controls are inside whenever they are not below the
      screen: it changes on exactly the jump the first one misses.
    */
    let onScreen = false;
    let notBelow = false;
    const update = () => setShown(notBelow && !onScreen);

    const screen = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    const aboveOrOn = new IntersectionObserver(
      ([entry]) => {
        notBelow = entry.isIntersecting;
        update();
      },
      { rootMargin: '100000px 0px 0px 0px' }
    );
    screen.observe(controls);
    aboveOrOn.observe(controls);
    return () => {
      screen.disconnect();
      aboveOrOn.disconnect();
    };
  }, []);

  if (!cart) return null;

  function backToPainting() {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
  }

  return (
    <div
      className={styles.bar}
      {...{ [BUY_BAR_ATTRIBUTE]: shown ? 'shown' : 'hidden' }}
      inert={!shown}
    >
      <button
        type="button"
        className={styles.label}
        onClick={backToPainting}
        aria-label={interpolate(copy.backToPainting, { title: work.title })}
      >
        <span className={styles.title}>{work.title}</span>
        <Price
          price={work.price}
          locale={locale}
          dictionary={priceCopy}
          isPlaceholder={work.isPlaceholder}
          status={work.status}
          className={styles.price}
        />
      </button>

      <button
        ref={buttonRef}
        type="button"
        className={styles.add}
        /* The same action as the original, so the drawer opens the same way and closes back here. */
        onClick={() => cart.addWork(work.id, buttonRef.current)}
      >
        <ShoppingBag size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>{copy.addToCart}</span>
      </button>
    </div>
  );
}
