'use client';

import { useActionState, useId, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import { interpolate } from '@/lib/i18n/interpolate';
import { DELIVERY_METHODS } from '@/lib/delivery';
import styles from './CheckoutForm.module.css';

/**
 * The checkout form: how the painting travels, who is buying it, and what it costs.
 *
 * **A client component for one reason**, the same one the admin's two forms give:
 * a rejected submission has to come back with its errors *and* the typed values
 * intact, without either travelling through a URL. An address lost to one bad
 * postal code, one field away from paying, is a purchase abandoned.
 *
 * **It does no money arithmetic at all.** Every figure it can display — the
 * subtotal, each method's delivery fee, each method's total — was computed in
 * agorot by `lib/data/orders-repository.js` and arrives already converted. The
 * delivery radio does not add a fee to a subtotal; it chooses which
 * pre-computed total to print. That is deliberate: the rules require the charged
 * total to come from `price_agorot` on the server, and a browser that can add is
 * a browser that can disagree.
 *
 * **The address fields are absent rather than disabled for self-pickup.** A
 * disabled field still reads as something you were meant to fill in and failed
 * to, it is still announced by a screen reader, and it still suggests the shop
 * wants an address it has no use for. There is no address for a collected
 * painting, so there is no field.
 *
 * @param {object} props
 * @param {Function} props.action - `submitCheckout`, with the locale and any
 *   quick-buy work id already bound server-side. Passed in rather than imported
 *   so a second copy of this form cannot drift from the one binding.
 * @param {string} props.locale
 * @param {object} props.dictionary
 * @param {{subtotal: object, methods: Record<string, {deliveryFee: object, total: object}>}} props.amounts
 */
export default function CheckoutForm({ action, locale, dictionary, amounts }) {
  const [state, formAction, isPending] = useActionState(action, null);

  /*
    Shipping is the default because it is the ordinary case, and because the
    alternative — nothing selected — means the total on screen is incomplete until
    the buyer happens to choose. A figure that says what you will pay from the
    first render is worth more than making the question feel unanswered.

    Local state rather than the form's own: React resets uncontrolled fields when
    an action completes, and the one thing that must survive a rejected submit is
    the choice that decides which fields exist.
  */
  const [method, setMethod] = useState('shipping');

  const copy = dictionary.checkout;
  const errors = state?.errors ?? {};
  const chosen = amounts.methods[method];
  const wantsAddress = method === 'shipping';

  return (
    <form action={formAction} className={styles.form} noValidate>
      {/*
        A painting went in the cart and has since sold. Announced, and at the top
        of the form rather than beside the button, because it is the one outcome
        where nothing the buyer does to this form will help — they have to go
        back. It names the paintings: "something in your order is unavailable"
        sends somebody to compare four titles against a gallery.
      */}
      {state?.error === 'unavailable' ? (
        <div className={styles.stop} role="alert">
          <h2 className={styles.stopTitle}>{copy.unavailableTitle}</h2>
          <p className={styles.stopLead}>{copy.unavailableLead}</p>

          {state.unavailableTitles?.length > 0 ? (
            <ul className={styles.stopList}>
              {state.unavailableTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          ) : null}

          {state.unavailableUnknownCount > 0 ? (
            <p className={styles.stopLead}>
              {interpolate(copy.unavailableUnknown, {
                count: state.unavailableUnknownCount,
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {state?.error === 'paymentUnavailable' || state?.error === 'paymentNotConfigured' ? (
        <p className={styles.stop} role="alert">
          {copy.errorPayment}
        </p>
      ) : null}

      {state?.error === 'empty' ? (
        <p className={styles.stop} role="alert">
          {copy.errorEmpty}
        </p>
      ) : null}

      {/* ---- How the painting travels. First, because it decides the rest. ---- */}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{copy.deliveryLegend}</legend>

        <div className={styles.choices}>
          {DELIVERY_METHODS.map((value) => (
            <DeliveryChoice
              key={value}
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
              label={value === 'shipping' ? copy.deliveryShipping : copy.deliveryPickup}
              note={value === 'shipping' ? copy.deliveryShippingNote : copy.deliveryPickupNote}
              /*
                The price of the choice, on the choice. A fee discovered only in
                the total below is a fee that feels added rather than chosen.
              */
              price={
                amounts.methods[value].deliveryFee.amount === 0
                  ? copy.deliveryFree
                  : formatPrice(amounts.methods[value].deliveryFee, locale)
              }
            />
          ))}
        </div>

        {errors.deliveryMethod ? (
          <p className={styles.error}>{copy.errors[errors.deliveryMethod]}</p>
        ) : null}
      </fieldset>

      {/* ---- The address, which exists only for shipping ---- */}

      {wantsAddress ? (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>{copy.addressLegend}</legend>

          <Field
            name="street"
            label={copy.addressStreet}
            defaultValue={state?.values?.street}
            error={errors.street ? copy.errors[errors.street] : null}
            autoComplete="street-address"
            required
          />

          <div className={styles.pair}>
            <Field
              name="city"
              label={copy.addressCity}
              defaultValue={state?.values?.city}
              error={errors.city ? copy.errors[errors.city] : null}
              autoComplete="address-level2"
              required
            />

            <Field
              name="postalCode"
              label={copy.addressPostalCode}
              defaultValue={state?.values?.postalCode}
              error={errors.postalCode ? copy.errors[errors.postalCode] : null}
              autoComplete="postal-code"
              /* Digits, so left-to-right inside an otherwise Hebrew form. */
              dir="ltr"
              inputMode="numeric"
              required
            />
          </div>
        </fieldset>
      ) : null}

      {/* ---- Who is buying ---- */}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{copy.buyerLegend}</legend>

        <Field
          name="name"
          label={copy.buyerName}
          defaultValue={state?.values?.name}
          error={errors.name ? copy.errors[errors.name] : null}
          autoComplete="name"
          required
        />

        <div className={styles.pair}>
          <Field
            name="email"
            type="email"
            label={copy.buyerEmail}
            defaultValue={state?.values?.email}
            error={errors.email ? copy.errors[errors.email] : null}
            autoComplete="email"
            /* A Latin string inside an RTL page, as in the admin's login form. */
            dir="ltr"
            required
          />

          <Field
            name="phone"
            type="tel"
            label={copy.buyerPhone}
            defaultValue={state?.values?.phone}
            error={errors.phone ? copy.errors[errors.phone] : null}
            autoComplete="tel"
            dir="ltr"
            inputMode="tel"
            required
          />
        </div>
      </fieldset>

      {/* ---- What it costs ---- */}

      <div className={styles.totals}>
        <p className={styles.row}>
          <span className={styles.rowLabel}>{copy.subtotal}</span>
          <span className={styles.rowAmount}>
            <bdi>{formatPrice(amounts.subtotal, locale)}</bdi>
          </span>
        </p>

        <p className={styles.row}>
          <span className={styles.rowLabel}>{copy.deliveryFee}</span>
          <span className={styles.rowAmount}>
            {chosen.deliveryFee.amount === 0 ? (
              copy.deliveryFree
            ) : (
              <bdi>{formatPrice(chosen.deliveryFee, locale)}</bdi>
            )}
          </span>
        </p>

        <p className={styles.totalRow}>
          <span className={styles.totalLabel}>{copy.total}</span>
          <span className={styles.totalAmount}>
            <bdi>{formatPrice(chosen.total, locale)}</bdi>
          </span>
        </p>
      </div>

      {/*
        Disabled while in flight, unlike the cart's add button — and for the
        opposite reason. Adding twice is harmless because there is no quantity;
        submitting twice would write two pending orders and sign two payment
        pages for one purchase.
      */}
      <button type="submit" className={styles.submit} disabled={isPending}>
        <CreditCard size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>{isPending ? copy.submitting : copy.submit}</span>
      </button>

      <p className={styles.security}>{copy.securityNote}</p>
    </form>
  );
}

/**
 * One delivery option: a radio, what it is, what it costs, and the sentence that
 * stops it promising something we cannot deliver.
 *
 * The pickup note is load-bearing rather than decorative. There is no shop, no
 * published address and no opening hours — collection is arranged with the
 * artist afterwards — so the wording says exactly that. A bare "collect in
 * person" invites somebody to turn up somewhere.
 */
function DeliveryChoice({ value, checked, onChange, label, note, price }) {
  const id = useId();

  return (
    <div className={[styles.choice, checked ? styles.choiceChecked : ''].filter(Boolean).join(' ')}>
      <input
        type="radio"
        id={id}
        /*
          The shared `name` is what makes these a radio *group* rather than two
          unrelated controls: it is what gives them one tab stop and arrow-key
          movement between the options, and it is what submits the chosen value.
          Controlled, so the choice survives the form reset React performs when an
          action completes.
        */
        name="deliveryMethod"
        value={value}
        className={styles.radio}
        checked={checked}
        onChange={onChange}
      />

      <label htmlFor={id} className={styles.choiceLabel}>
        <span className={styles.choiceName}>{label}</span>
        <span className={styles.choicePrice}>{price}</span>
        <span className={styles.choiceNote}>{note}</span>
      </label>
    </div>
  );
}

/**
 * One labelled text input, with its error beneath it.
 *
 * `noValidate` on the form means the browser's own bubbles never appear, so
 * every message is ours, in the buyer's language, and in the same place every
 * time. `required` stays on the input for the semantics rather than the
 * behaviour — it is what tells a screen reader the field is required.
 */
function Field({ name, label, error, type = 'text', defaultValue, ...rest }) {
  const id = useId();
  const errorId = id + '-error';

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>

      <input
        id={id}
        name={name}
        type={type}
        className={[styles.input, error ? styles.inputInvalid : ''].filter(Boolean).join(' ')}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />

      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
