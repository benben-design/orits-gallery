/**
 * How the site sells — the one switch between taking payment online and
 * arranging a purchase personally with the artist.
 *
 * **Purchase by contact unless online payment is explicitly enabled.** The
 * site starts as an experiment: a buyer is put in touch with the artist rather
 * than sent to a payment page. So the safe state is the default one, and
 * `SALES_MODE` switches to online payment only when it is exactly `online`.
 * Unset, misspelt, `ONLINE` or anything else leaves the site in contact mode —
 * forgetting the switch can only ever close the checkout, never open it.
 *
 * **It is never inferred from the payment keys.** Whether `HYP_*` is set
 * answers "could we sign a payment page", which is a different question from
 * "should we". A test terminal's keys sitting in an environment must not be
 * what turns a production site into a shop that charges cards.
 *
 * In contact mode the checkout is unreachable on the server, not only in the
 * interface: the checkout page redirects to the cart and `submitCheckout`
 * refuses in its first statement, so nothing writes an order row or calls Hyp.
 * The cart, adding to it and the drawer are the same in both modes; what
 * changes is that their purchase controls open `PurchaseDialog` instead of
 * leading to checkout.
 *
 * **Read at request time by the checkout, at build time by everything
 * prerendered.** The public layout hands the mode to the cart, and every
 * prerendered page carries the value it was built with — so changing the
 * variable on Netlify needs a new deploy, exactly like `ALLOW_SEARCH_INDEXING`.
 *
 * Imports nothing and reads no secret.
 */

export const SALES_MODE_VARIABLE = 'SALES_MODE';

/** The two ways the site can sell, as a closed set. */
export const SALES_MODES = Object.freeze({
  online: 'online',
  contact: 'contact',
});

export function getSalesMode() {
  return process.env[SALES_MODE_VARIABLE] === SALES_MODES.online
    ? SALES_MODES.online
    : SALES_MODES.contact;
}

export function isOnlinePaymentEnabled() {
  return getSalesMode() === SALES_MODES.online;
}
