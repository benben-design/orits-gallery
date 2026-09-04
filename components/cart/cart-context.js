'use client';

import { createContext, useContext } from 'react';

/**
 * The cart's shared state, in its own file so `CartProvider` can render
 * `CartDrawer` without the two importing each other.
 *
 * **A React context, not a state library.** code-style.md rules out the latter
 * and asks for local state lifted to the nearest common ancestor. The nearest
 * common ancestor of the header's cart button, the buy button on an artwork
 * page and the drawer itself is the public layout — which is a server
 * component and cannot hold state. A context is the plain-React answer to
 * exactly that shape, and it costs no dependency.
 *
 * @type {import('react').Context<null | {
 *   open: boolean,
 *   count: number,
 *   contents: null | {works: object[], total: object|null, missingCount: number},
 *   notice: string|null,
 *   pending: boolean,
 *   openCart: (returnFocusTo?: HTMLElement|null) => void,
 *   closeCart: () => void,
 *   addWork: (workId: string) => void,
 *   removeWork: (workId: string) => void,
 *   clearMissing: () => void,
 * }>}
 */
export const CartContext = createContext(null);

/**
 * The cart, for any client component inside the public layout.
 *
 * Throws rather than returning null when there is no provider above it: a cart
 * button that silently does nothing is far harder to find than one that fails
 * the moment it renders.
 */
export function useCart() {
  const cart = useContext(CartContext);

  if (!cart) {
    throw new Error(
      'useCart must be used inside <CartProvider>. The public layout renders ' +
        'it; a component outside app/(site)/[locale] has no cart.'
    );
  }

  return cart;
}
