/**
 * Validating what a buyer typed into the checkout form.
 *
 * The same shape as `lib/data/work-input.js`: **pure, no database, no React**,
 * loadable by plain Node, and it returns error **codes** rather than sentences
 * because the Hebrew and the English both live in the locale files.
 *
 * **It also keeps what was typed.** A rejected checkout re-renders with the
 * values still in the boxes — losing a filled-in address one field from paying
 * is how somebody abandons a purchase, and at these prices that is an expensive
 * way to be tidy.
 *
 * Two deliberate restraints on how strict this is:
 *
 * - **No email regex.** Migration 003 says so at the column and it is right: a
 *   pattern strict enough to be worth writing rejects somebody's perfectly valid
 *   address at the worst possible moment. This checks that there is an `@` with
 *   something either side of it and no spaces, which catches a typo and a blank
 *   and nothing else.
 * - **The postal code is checked, because a wrong one is a parcel that does not
 *   arrive.** Israel Post uses five or seven digits, so that is the whole rule —
 *   spaces and hyphens are stripped first rather than refused, since that is how
 *   people write them.
 */
import { DELIVERY_METHODS, isDeliveryMethod, needsShippingAddress } from '@/lib/delivery';

/**
 * Generous ceilings, not opinions about content. They exist so a pasted novel
 * cannot reach the database, not to tell anyone their name is too long.
 */
const MAX_LENGTHS = Object.freeze({
  name: 120,
  email: 200,
  phone: 40,
  street: 160,
  city: 80,
  postalCode: 20,
});

/** Reads one field, trimmed, never null — a missing field and a blank one are the same mistake. */
function readField(formData, field) {
  const value = formData.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function looksLikeEmail(value) {
  if (/\s/.test(value)) return false;

  const at = value.indexOf('@');
  /* Something before the @, something after it, and only one of them. */
  return at > 0 && at === value.lastIndexOf('@') && at < value.length - 1;
}

function normalisePostalCode(value) {
  return value.replace(/[\s-]/g, '');
}

/**
 * Composes the one address string the database stores.
 *
 * `orders.shipping_address` is a single text column on purpose — 003 decided
 * that, and noted that splitting it is a migration for the day a courier's API
 * needs the parts separately. The form collects the parts because that is how an
 * Israeli address is written and because it is what makes a missing city
 * obvious; they are joined here, in one place, so the stored form is consistent.
 */
function composeAddress({ street, city, postalCode }) {
  return [street, city, normalisePostalCode(postalCode)].filter(Boolean).join(', ');
}

/**
 * Validates a submitted checkout.
 *
 * @param {FormData} formData
 * @returns {{ok: true, values: object, buyer: object, deliveryMethod: string}
 *          | {ok: false, values: object, errors: Record<string, string>}}
 */
export function validateCheckoutInput(formData) {
  const values = {
    name: readField(formData, 'name'),
    email: readField(formData, 'email'),
    phone: readField(formData, 'phone'),
    deliveryMethod: readField(formData, 'deliveryMethod'),
    street: readField(formData, 'street'),
    city: readField(formData, 'city'),
    postalCode: readField(formData, 'postalCode'),
  };

  /** @type {Record<string, string>} */
  const errors = {};

  /* ---- Always required, whichever way the painting travels ---- */

  if (!values.name) errors.name = 'nameRequired';
  else if (values.name.length > MAX_LENGTHS.name) errors.name = 'tooLong';

  if (!values.email) errors.email = 'emailRequired';
  else if (values.email.length > MAX_LENGTHS.email) errors.email = 'tooLong';
  else if (!looksLikeEmail(values.email)) errors.email = 'emailInvalid';

  if (!values.phone) errors.phone = 'phoneRequired';
  else if (values.phone.length > MAX_LENGTHS.phone) errors.phone = 'tooLong';

  /* ---- Delivery ---- */

  if (!isDeliveryMethod(values.deliveryMethod)) {
    /*
      Unreachable from the form, which offers two radios and nothing else — and
      checked anyway, because a Server Action is a POST endpoint a browser can
      address directly. The closed set is the one in lib/delivery.js, which is
      also the set the database constrains.
    */
    errors.deliveryMethod = 'deliveryMethodInvalid';
  }

  /* ---- The address, only when it is needed ---- */

  const wantsAddress = needsShippingAddress(values.deliveryMethod);

  if (wantsAddress) {
    if (!values.street) errors.street = 'streetRequired';
    else if (values.street.length > MAX_LENGTHS.street) errors.street = 'tooLong';

    if (!values.city) errors.city = 'cityRequired';
    else if (values.city.length > MAX_LENGTHS.city) errors.city = 'tooLong';

    const postalCode = normalisePostalCode(values.postalCode);

    if (!postalCode) errors.postalCode = 'postalCodeRequired';
    else if (!/^\d{5}$|^\d{7}$/.test(postalCode)) errors.postalCode = 'postalCodeInvalid';
  }

  if (Object.keys(errors).length > 0) return { ok: false, values, errors };

  return {
    ok: true,
    values,
    deliveryMethod: values.deliveryMethod,
    buyer: {
      name: values.name,
      email: values.email,
      phone: values.phone,
      /*
        Null rather than an empty string for self-pickup. The database requires
        the absence (`orders_pickup_has_no_address`), and an empty string would
        satisfy neither that constraint nor anybody reading the row later.
      */
      address: wantsAddress ? composeAddress(values) : null,
    },
  };
}

/** Re-exported so a form can build its radios from the same set this validates against. */
export { DELIVERY_METHODS };
