'use client';

import { CreditCard } from 'lucide-react';
import { useCart } from './cart-context';

/**
 * The `/cart` page's purchase control in contact mode — the one piece of that
 * server-rendered page that has to be client code, because what it does is
 * open the purchase dialog the provider holds. The page decides the mode and
 * which works can be bought; this only hands them over.
 *
 * Unlike the rest of the page it needs JavaScript. That is the same trade the
 * drawer made: there is no way to open a dialog in place without it.
 */
export default function PurchaseButton({ works, label, className }) {
  const { openPurchase } = useCart();

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => openPurchase(works, event.currentTarget)}
    >
      <CreditCard size={18} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
