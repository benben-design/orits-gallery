/**
 * How each of the four work statuses is presented, and which of them can be
 * bought.
 *
 * This table is the single source of the rule. Three things read it —
 * StatusBadge decides whether to render a badge and which one, Price decides
 * what happens to the amount, and the cart decides whether a painting may go
 * in — and none of them may hard-code a status name, or the halves of a
 * state drift apart.
 *
 * The four states, and why each looks the way it does:
 *
 *   available     No badge, plain price. This is the default state and needs no
 *                 label; a badge on every card is noise. The visible price is
 *                 itself the signal that the work can be bought.
 *
 *   reserved      A badge, plain price. This is the state a buyer actually acts
 *                 on — someone else is mid-purchase — so it has to be
 *                 unmistakable at a glance without being alarming.
 *
 *   sold          A badge, and the price struck through. The work stays on
 *                 display: it is part of the body of work and evidence of
 *                 demand, not something to hide.
 *
 *   not-for-sale  No badge. The price is replaced by the words for "not for
 *                 sale". This is not a stage of a transaction, it is the
 *                 absence of one, so it does not borrow the visual language of
 *                 the other three.
 *
 * STATUS IS NEVER CARRIED BY COLOUR ALONE. The palette has one accent and one
 * secondary ink, so every distinction here lives in form — whether a badge is
 * present, which badge it is, and what happens to the price. That is what keeps
 * it legible for a colour-blind buyer, and in a screenshot.
 */

/**
 * `buyable` is the fourth column, and the only one that is not about looks.
 *
 * **Exactly one status can be bought.** `reserved` is deliberately not one of
 * them: it means somebody else is mid-purchase, and letting a second person
 * queue behind them opens a second front door onto the double-sale problem
 * commerce.md is written to close. `sold` and `not-for-sale` speak for
 * themselves.
 *
 * It lives here rather than as a literal in the cart so that adding a fifth
 * status is a decision about whether it can be bought, taken in the same place
 * as the decision about how it looks — instead of a value that silently
 * inherits whatever the fallback does.
 */

/** @typedef {{badge: 'reserved'|'sold'|null, price: 'amount'|'struck'|'replaced', buyable: boolean}} StatusPresentation */

/** @type {Record<string, StatusPresentation>} */
export const STATUS_PRESENTATION = {
  available: { badge: null, price: 'amount', buyable: true },
  reserved: { badge: 'reserved', price: 'amount', buyable: false },
  sold: { badge: 'sold', price: 'struck', buyable: false },
  'not-for-sale': { badge: null, price: 'replaced', buyable: false },
};

/**
 * The presentation for a status, falling back to the plainest rendering.
 *
 * An unrecognised status renders as a bare amount with no badge rather than
 * throwing, because a display component is the wrong place to fail a page.
 *
 * **The fallback is not buyable**, and that direction is the whole point: a
 * status nobody has thought about yet must not be purchasable by default. It
 * is not a way in to buying something unavailable either way — checkout
 * re-verifies status server-side at the moment of payment regardless of what
 * any card showed. See commerce.md.
 *
 * @param {string} status
 * @returns {StatusPresentation}
 */
export function getStatusPresentation(status) {
  return STATUS_PRESENTATION[status] ?? { badge: null, price: 'amount', buyable: false };
}

/**
 * Whether a painting in this status can be put in a cart and bought.
 *
 * The cart's actions and the button on the artwork page both ask this, so the
 * control that offers the purchase and the code that permits it cannot
 * disagree about a state.
 *
 * @param {string} status
 * @returns {boolean}
 */
export function isBuyable(status) {
  return getStatusPresentation(status).buyable;
}
