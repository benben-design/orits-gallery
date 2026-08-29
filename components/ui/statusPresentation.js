/**
 * How each of the four work statuses is presented.
 *
 * This table is the single source of the rule. Two components read it —
 * StatusBadge decides whether to render a badge and which one, Price decides
 * what happens to the amount — and neither may hard-code a status name, or the
 * two halves of a state's presentation drift apart.
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

/** @typedef {{badge: 'reserved'|'sold'|null, price: 'amount'|'struck'|'replaced'}} StatusPresentation */

/** @type {Record<string, StatusPresentation>} */
export const STATUS_PRESENTATION = {
  available: { badge: null, price: 'amount' },
  reserved: { badge: 'reserved', price: 'amount' },
  sold: { badge: 'sold', price: 'struck' },
  'not-for-sale': { badge: null, price: 'replaced' },
};

/**
 * The presentation for a status, falling back to the plainest rendering.
 *
 * An unrecognised status renders as a bare amount with no badge rather than
 * throwing, because a display component is the wrong place to fail a page. It
 * is not a way in to buying something unavailable: checkout re-verifies status
 * server-side at the moment of payment regardless of what any card showed. See
 * commerce.md.
 *
 * @param {string} status
 * @returns {StatusPresentation}
 */
export function getStatusPresentation(status) {
  return STATUS_PRESENTATION[status] ?? { badge: null, price: 'amount' };
}
