'use client';

import { useRef } from 'react';
import { ShoppingBag } from 'lucide-react';
import { isBuyable } from '@/components/ui/statusPresentation';
import { useCart } from './cart-context';
import styles from './AddToCart.module.css';

/**
 * The one place on the public site where a painting can be bought.
 *
 * **It renders nothing at all unless the work is both published and buyable**,
 * and those two conditions do more work than they look:
 *
 *   - `publishedAt` is what makes this correct inside the admin's preview. That
 *     route renders `ArtworkDetail` from an admin-scoped read, so a draft passes
 *     through here — and a draft is not for sale at any status. Without this the
 *     preview would offer a button that the action then refuses, which is a
 *     worse answer than no button.
 *   - `isBuyable` reads the four-state table rather than comparing to
 *     'available', so the control that offers a purchase and the action that
 *     permits one cannot disagree about a state. See statusPresentation.js.
 *
 * Neither check is the security boundary. `addWorkToCart` runs both again
 * against the database, because what a page rendered a minute ago is not
 * evidence of anything — commerce.md, on the double-sale problem.
 *
 * **It is a client component, and that is a change with a cost.** It used to be
 * a plain form posting to a Server Action, which worked with JavaScript
 * switched off and redirected to `/cart`. The cart is a drawer now: it opens in
 * place and never navigates, and there is no way to do that without script. The
 * trade was taken deliberately — `/cart` is still built, still server-rendered
 * and still reachable, and the drawer links to it.
 *
 * The icon is the header's cart, deliberately: the button says where the
 * painting is going, and the same glyph in both places is what makes that
 * legible without a sentence.
 */
export default function AddToCart({ work, dictionary }) {
  const { addWork } = useCart();
  const buttonRef = useRef(null);

  if (!work.publishedAt) return null;
  if (!isBuyable(work.status)) return null;

  return (
    <div className={styles.form}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        /*
          The button is handed to the cart so that closing the drawer puts the
          keyboard back here, rather than at the top of the document.
        */
        onClick={() => addWork(work.id, buttonRef.current)}
        /*
          Deliberately not disabled while the add is in flight, for two reasons.
          A disabled control that had focus is blurred to <body> by the browser,
          which fights the drawer moving focus into itself; and `pending` is the
          cart's, not this button's, so removing something in the drawer would
          disable a buy button on the page behind it. Adding twice is harmless —
          `addWorkToCart` is idempotent, because there is no quantity.
        */
      >
        <ShoppingBag size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>{dictionary.artwork.addToCart}</span>
      </button>
    </div>
  );
}
