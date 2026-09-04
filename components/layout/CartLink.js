'use client';

import { useRef } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/cart/cart-context';
import { interpolate } from '@/lib/i18n/interpolate';
import styles from './CartLink.module.css';

/**
 * The cart in the header: how many paintings are in it, and the way to open it.
 *
 * **A button rather than a link now.** It used to navigate to `/cart`; the cart
 * is a panel that slides in over the page, so opening it is not a navigation
 * and must not be announced as one. The page itself is still built and still
 * reachable — the drawer has the link at its foot.
 *
 * **The count comes from the cookie, read in the browser**, not from the
 * server. That is the whole reason this is a client component: reading the cart
 * in the public layout would opt **every public page** out of static rendering
 * to print one numeral, and the artwork pages are pre-generated. The trade is
 * that the count is not in the server-rendered HTML and arrives on hydration,
 * so it fades in rather than snapping — which is what makes that read as
 * arriving rather than as a flicker. `CartProvider` owns the reading; this only
 * displays it.
 */
export default function CartLink({ label, labelWithCount }) {
  const { count, openCart } = useCart();
  const buttonRef = useRef(null);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.link}
      /* Handed over so closing the drawer returns the keyboard to this button. */
      onClick={() => openCart(buttonRef.current)}
      /* Named with its contents once there are some, so it does not announce as
         "Cart" while visibly carrying a number. */
      aria-label={count > 0 ? interpolate(labelWithCount, { count }) : label}
    >
      <ShoppingBag className={styles.icon} strokeWidth={1.5} aria-hidden="true" />

      {count > 0 ? (
        /* aria-hidden because the button's own label already says the count;
           announcing both is how a screen reader reads "Cart 2, 2". */
        <span className={styles.count} aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}
