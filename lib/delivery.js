/**
 * How a painting reaches its buyer, and what that costs.
 *
 * **The one place the delivery rate is written.** Checkout reads it to compute
 * what to charge, and nothing else may restate it — a second copy is how a rate
 * change updates the price in one place and not the other.
 *
 * **It is expected to move to `/admin/settings`**, which does not exist yet.
 * That is the whole reason this is a module with a named export rather than a
 * literal inside the checkout: when the rate becomes a stored setting, this file
 * is what changes, and every caller goes on asking the same question.
 *
 * **Changing the rate here never changes an existing order.** `orders` stores
 * `delivery_fee_agorot` — what was actually charged, written once at checkout —
 * and reads it back as a fact rather than recomputing it. See migration 009,
 * which explains at length why that column exists. This module answers "what
 * would we charge now"; only the database answers "what did we charge then".
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
 * The flat shipping rate, in **agorot**.
 *
 * Minor units, like every other amount that reaches the database, so that no
 * conversion happens between here and the column it is stored in. A float of
 * 40.0 multiplied by 100 at some later call site is how a rate becomes 3999.
 *
 * Flat anywhere in Israel, deliberately: a zone table would be a pricing model
 * to maintain for a country four hours long, and the artist would have to keep
 * it current.
 */
export const SHIPPING_FEE_AGOROT = 4000;

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
 * What a given delivery method costs today, in agorot.
 *
 * **It throws on an unknown method rather than falling back to free.** That is
 * the opposite of how `getStatusPresentation` treats an unrecognised status, and
 * deliberately so: a display component falling back to the plainest rendering
 * costs nothing, while a money function falling back to zero silently waives a
 * charge and nothing downstream would notice. Validate with `isDeliveryMethod`
 * at the boundary; by the time this is called the method is known.
 *
 * @param {string} method - One of `DELIVERY_METHODS`.
 * @returns {number} The fee in agorot.
 */
export function deliveryFeeAgorot(method) {
  if (method === 'shipping') return SHIPPING_FEE_AGOROT;
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
