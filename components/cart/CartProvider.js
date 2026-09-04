'use client';

import { useCallback, useRef, useState, useTransition, useSyncExternalStore } from 'react';
import { CartContext } from './cart-context';
import CartDrawer from './CartDrawer';
import { readCartContents, addWorkToCart, removeWorkFromCart, removeMissingFromCart } from '@/lib/cart/actions';
import { parseCart, readCookieValue, CART_COOKIE_NAME } from '@/lib/cart/cart-contents';

/**
 * Holds the cart's open/closed state and its contents, and renders the drawer.
 *
 * **It wraps the whole public layout but does not drag it into the browser.**
 * `children` arrives already rendered on the server and is passed straight
 * through, which is the standard way a client component hosts server ones — so
 * the homepage and every artwork page stay statically generated. That property
 * was measured before and after: the build still marks them `●`.
 *
 * **Two sources of truth, deliberately, and they answer different questions.**
 *
 *   - **The count comes from the cookie**, read in the browser. It has to be
 *     right on every page with no round trip, and the cookie is already there.
 *   - **The contents come from a Server Action**, because only the server knows
 *     what those ids currently mean. A painting sold on another platform is a
 *     fact the cookie cannot carry, so it is re-read every time the drawer
 *     opens and after every change. See commerce.md.
 *
 * They cannot drift: every action writes the cookie and returns the contents in
 * the same response, and the count re-reads the cookie on the render that
 * follows.
 *
 * **This is the one part of the cart that needs JavaScript**, which was a
 * deliberate choice rather than an oversight — the earlier version was a plain
 * form post that redirected to `/cart`, and it was dropped in favour of the
 * drawer. `/cart` is still built and still works with no script at all; the
 * drawer links to it.
 */
export default function CartProvider({ dictionary, locale, children }) {
  const [open, setOpen] = useState(false);
  const [contents, setContents] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, startTransition] = useTransition();

  /*
    What to focus when the drawer closes. Whatever opened it — the header
    button, or the buy button on an artwork page — so a keyboard user is put
    back where they were rather than at the top of the document.
  */
  const returnFocusRef = useRef(null);

  /*
    The count, read straight from the cookie. `useSyncExternalStore` re-reads
    its snapshot on every render of this component, and every action below sets
    state — so the number is current immediately after a change without anything
    having to remember to update it.
  */
  const subscribe = useCallback((onStoreChange) => {
    window.addEventListener('pageshow', onStoreChange);
    document.addEventListener('visibilitychange', onStoreChange);

    return () => {
      window.removeEventListener('pageshow', onStoreChange);
      document.removeEventListener('visibilitychange', onStoreChange);
    };
  }, []);

  const count = useSyncExternalStore(subscribe, readCountFromCookie, readCountOnServer);

  const closeCart = useCallback(() => {
    setOpen(false);
    setNotice(null);

    /* Put the keyboard back where it was, if it was anywhere. */
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, []);

  const openCart = useCallback((returnFocusTo = null) => {
    returnFocusRef.current = returnFocusTo;
    setNotice(null);
    setOpen(true);

    startTransition(async () => {
      setContents(await readCartContents());
    });
  }, []);

  /**
   * Adds a painting and opens the drawer on the result.
   *
   * The drawer opens **before** the action resolves, so the panel is on screen
   * while the server is still answering rather than after a pause in which
   * nothing appeared to happen. `pending` is what it shows in the meantime.
   */
  const addWork = useCallback((workId, returnFocusTo = null) => {
    returnFocusRef.current = returnFocusTo;
    setNotice(null);
    setOpen(true);

    startTransition(async () => {
      const result = await addWorkToCart(workId);
      setContents(result);
      setNotice(result.notice);
    });
  }, []);

  const removeWork = useCallback((workId) => {
    startTransition(async () => {
      const result = await removeWorkFromCart(workId);
      setContents(result);
      setNotice(null);
    });
  }, []);

  const clearMissing = useCallback(() => {
    startTransition(async () => {
      const result = await removeMissingFromCart();
      setContents(result);
      setNotice(null);
    });
  }, []);

  const value = {
    open,
    count,
    contents,
    notice,
    pending,
    openCart,
    closeCart,
    addWork,
    removeWork,
    clearMissing,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartDrawer dictionary={dictionary} locale={locale} />
    </CartContext.Provider>
  );
}

/** The number of paintings the cookie says are held. */
function readCountFromCookie() {
  return parseCart(readCookieValue(document.cookie, CART_COOKIE_NAME)).length;
}

/**
 * Nothing on the server, which is the honest answer: these pages are
 * statically generated, so the server never saw this visitor's cookie.
 */
function readCountOnServer() {
  return 0;
}
