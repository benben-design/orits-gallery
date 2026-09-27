/**
 * How a painting reaches its buyer, and what that costs.
 *
 * **The rate is not written here any more.** It is a site setting —
 * `site_settings.shipping_fee_agorot`, with `self_pickup_offered` beside it
 * (migration 011) — edited by the artist at `/admin/settings` and read by the
 * orders repository, which passes it in. What stays here is what she does not
 * edit: which methods exist, that pickup is free, and how a method and a rate
 * become a fee.
 *
 * **Changing the rate never changes an existing order.** `orders` stores
 * `delivery_fee_agorot` — what was actually charged, written once at checkout —
 * and reads it back as a fact rather than recomputing it. See migration 009,
 * which explains at length why that column exists. The setting answers "what
 * would we charge now"; only the order answers "what did we charge then".
 *
 * Pure: no database, no React, no request. Loadable by plain Node.
 */

/**
 * The two ways an order can be delivered.
 *
 * A closed set, and constrained in the database as well — `delivery_method` on
 * `orders` carries a check listing exactly these. Adding a third is a migration
 * *and* two locale entries, the same shape of job as adding a medium.
 *
 * `shipping` is first because it is the ordinary case: most buyers are not in
 * driving distance of the studio.
 */
export const DELIVERY_METHODS = Object.freeze(['shipping', 'self-pickup']);

/**
 * Self-pickup is free, and that is not a rate — it is the absence of one.
 *
 * Named anyway rather than written as a bare 0, because the database enforces
 * that a pickup order's fee is exactly zero (`orders_pickup_is_free`) and a
 * reader should be able to find the two halves of that rule from either side.
 */
export const PICKUP_FEE_AGOROT = 0;

/**
 * Whether a value is one of the delivery methods.
 *
 * For validating input at the boundary, the way `isLocale` is used for a locale
 * — so an unknown value is refused where the error can be shown in the buyer's
 * own language, rather than reaching the database and coming back as a
 * constraint violation nobody can act on.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDeliveryMethod(value) {
  return DELIVERY_METHODS.includes(value);
}

/**
 * The methods a buyer may choose today.
 *
 * Shipping always; pickup only while the artist offers it. **This narrows the
 * form and the validation, never the database**: `orders.delivery_method` still
 * accepts both, because an order placed for pickup last month stays a pickup
 * order whatever the setting says now.
 *
 * @param {boolean} selfPickupOffered - From the site settings.
 * @returns {string[]} In `DELIVERY_METHODS` order.
 */
export function offeredDeliveryMethods(selfPickupOffered) {
  return DELIVERY_METHODS.filter((method) => method !== 'self-pickup' || selfPickupOffered);
}

/**
 * What a given delivery method costs today, in agorot.
 *
 * The shipping rate is passed in rather than read, so this stays pure and the
 * one read of the setting happens where the rest of the order is priced — in
 * the orders repository, inside the transaction that writes the order.
 *
 * **It throws on an unknown method rather than falling back to free.** That is
 * the opposite of how `getStatusPresentation` treats an unrecognised status, and
 * deliberately so: a display component falling back to the plainest rendering
 * costs nothing, while a money function falling back to zero silently waives a
 * charge and nothing downstream would notice. Validate with `isDeliveryMethod`
 * at the boundary; by the time this is called the method is known.
 *
 * @param {string} method - One of `DELIVERY_METHODS`.
 * @param {number} shippingFeeAgorot - The current flat rate, from the site
 *   settings. Agorot, like the column it came from, so nothing converts.
 * @returns {number} The fee in agorot.
 */
export function deliveryFeeAgorot(method, shippingFeeAgorot) {
  if (method === 'shipping') {
    /* A money function refuses rather than guessing, for the reason below. */
    if (!Number.isInteger(shippingFeeAgorot) || shippingFeeAgorot < 0) {
      throw new Error('deliveryFeeAgorot needs the shipping rate in whole agorot; got ' + JSON.stringify(shippingFeeAgorot));
    }
    return shippingFeeAgorot;
  }
  if (method === 'self-pickup') return PICKUP_FEE_AGOROT;

  throw new Error(
    'Unknown delivery method: ' +
      JSON.stringify(method) +
      '. It must be one of ' +
      DELIVERY_METHODS.join(', ') +
      ' — validate with isDeliveryMethod() before asking for a fee.'
  );
}

/**
 * Whether this method needs a postal address.
 *
 * The application half of `orders_shipping_requires_address` and
 * `orders_pickup_has_no_address`. A pickup order must carry **no** address at
 * all — not an empty string, and not the studio's own address standing in for
 * the buyer's, which is what a required field invites somebody to type.
 *
 * @param {string} method
 * @returns {boolean}
 */
export function needsShippingAddress(method) {
  return method === 'shipping';
}
