'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import { interpolate } from '@/lib/i18n/interpolate';
import { DELIVERY_METHODS } from '@/lib/delivery';
import styles from './CheckoutForm.module.css';

/**
 * Every field that can be rejected, **in the order it appears on the page**,
 * with the dictionary key naming it.
 *
 * The order is the whole point: it is what makes "the first thing wrong" mean
 * the first one a buyer would reach rather than whichever key the validator
 * happened to write first. The address three are absent for self-pickup and the
 * validator never rejects them there, so a summary built from this list cannot
 * offer a link to a field that is not on the page.
 */
const FIELD_ORDER = [
  { name: 'deliveryMethod', labelKey: 'deliveryLegend' },
  { name: 'street', labelKey: 'addressStreet' },
  { name: 'city', labelKey: 'addressCity' },
  { name: 'postalCode', labelKey: 'addressPostalCode' },
  { name: 'name', labelKey: 'buyerName' },
  { name: 'email', labelKey: 'buyerEmail' },
  { name: 'phone', labelKey: 'buyerPhone' },
];

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
 * @param {{subtotal: object, methods: Record<string, {deliveryFee: object, total: object, totalAgorot: number}>}} props.amounts
 *   Only the methods on offer today are in `methods`, so a method switched off
 *   in the settings is never drawn.
 *
 * **The figures can be replaced by the action.** When the submit finds that
 * the total has changed since the page rendered, or that pickup has been
 * switched off, it hands back the current figures and the form draws those
 * instead — the page's own props are what was true when it loaded, and the
 * action's are what is true now.
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
  const [selected, setMethod] = useState('shipping');

  /* The newest figures the form has: the action's, once it has returned any. */
  const current = state?.amounts ?? amounts;

  /*
    If the chosen method has gone from the offer — pickup switched off while the
    page was open — the form falls back to shipping, which is always offered,
    rather than drawing a total for a method that no longer exists.
  */
  const method = current.methods[selected] ? selected : 'shipping';

  const copy = dictionary.checkout;
  const errors = state?.errors ?? {};
  const chosen = current.methods[method];
  const wantsAddress = method === 'shipping';

  /*
    One prefix for every control on this form, so a field's id is predictable
    from its name. The summary below has to link to fields it does not render,
    and a useId() inside each Field gives ids nothing outside it can name.
  */
  const ids = useId();
  const fieldId = (name) => `${ids}-${name}`;

  /** What was rejected, in page order, with the wording to point at it. */
  const rejected = FIELD_ORDER.filter((field) => errors[field.name]);

  /** Pickup was switched off in the settings while this page was open. */
  const deliveryWithdrawn = errors.deliveryMethod === 'deliveryMethodNotOffered';

  /**
   * Where the keyboard goes when a submission comes back rejected.
   *
   * **Focus moves to the summary rather than to the first bad field**, and the
   * difference matters for the person this is for. Focusing the field announces
   * that one field; focusing the summary announces that the submission failed,
   * how many fields are wrong, and puts a link to each of them one Tab away —
   * so the buyer learns the shape of the problem before being dropped into one
   * corner of it. It is also the only arrangement where the count is spoken at
   * all. This is the pattern GOV.UK's error summary uses, for the same reason.
   *
   * `role="alert"` stays on it as well, because a submission that is rejected
   * while the buyer's focus has already moved elsewhere still has to speak.
   */
  const summaryRef = useRef(null);

  const changedRef = useRef(null);

  useEffect(() => {
    if (state?.error === 'invalid') summaryRef.current?.focus();
    if (state?.error === 'amountChanged') changedRef.current?.focus();
  }, [state]);

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

      {/*
        The total changed between the page loading and the buyer pressing pay:
        the shipping rate, or a painting's price, was edited meanwhile. Nothing
        was charged and no order was written. The figures below are already the
        new ones; this says so, and pressing pay again is the confirmation.
        Focused when it appears, like the error summary, so it is heard before
        anything else.
      */}
      {state?.error === 'amountChanged' ? (
        <div className={styles.stop} role="alert" tabIndex={-1} ref={changedRef}>
          <p className={styles.stopLead}>
            {interpolate(copy.amountChanged, {
              total: formatPrice(chosen.total, locale),
            })}
          </p>
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

      {/*
        A rejected field, which is the ordinary failure and was the silent one:
        the action returns `invalid`, the per-field messages render correctly
        associated — and until this block existed nothing announced that
        anything had happened at all. To a screen reader the page was unchanged
        after pressing pay, one step from money. Error identification, Level A.

        The sentence is `errorRequired`, which was written for exactly this and
        sat in both locale files rendered by nothing.

        **The list is the half that saves the hunting.** Each entry is an
        ordinary in-page link to the field that was rejected, in page order, so
        the fix is Tab-then-Enter rather than a search through a form whose bad
        field may be below the fold. It is the same arrangement the admin's work
        form uses for its unapproved translations, and the same idea as the
        orders list: the block explains, the link locates.

        **A withdrawn delivery option is not a field left empty**, and the
        summary says so. Pickup switched off while the page was open is
        something that happened to the buyer rather than something they got
        wrong, so it leads with `errorDeliveryChanged`. The fill-in sentence
        follows only if some other field was rejected in the same submission,
        so the list of links beneath is never introduced by the wrong sentence.
      */}
      {state?.error === 'invalid' ? (
        <div className={styles.stop} role="alert" tabIndex={-1} ref={summaryRef}>
          {deliveryWithdrawn ? (
            <p className={styles.stopLead}>{copy.errorDeliveryChanged}</p>
          ) : null}

          {!deliveryWithdrawn || rejected.length > 1 ? (
            <p className={styles.stopLead}>{copy.errorRequired}</p>
          ) : null}

          {rejected.length > 0 ? (
            <ul className={styles.stopList}>
              {rejected.map((field) => (
                <li key={field.name}>
                  <a className={styles.stopLink} href={`#${fieldId(field.name)}`}>
                    {copy[field.labelKey]}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ---- How the painting travels. First, because it decides the rest. ---- */}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{copy.deliveryLegend}</legend>

        <div className={styles.choices}>
          {DELIVERY_METHODS.filter((value) => current.methods[value]).map((value, index) => (
            <DeliveryChoice
              key={value}
              value={value}
              /*
                The group has one id to be linked to, and it belongs on the
                first radio — the target of a link has to be something focus can
                land on, and a fieldset is not.
              */
              id={index === 0 ? fieldId('deliveryMethod') : `${ids}-deliveryMethod-${value}`}
              checked={method === value}
              onChange={() => setMethod(value)}
              label={value === 'shipping' ? copy.deliveryShipping : copy.deliveryPickup}
              note={value === 'shipping' ? copy.deliveryShippingNote : copy.deliveryPickupNote}
              /*
                The price of the choice, on the choice. A fee discovered only in
                the total below is a fee that feels added rather than chosen.
              */
              price={
                current.methods[value].deliveryFee.amount === 0
                  ? copy.deliveryFree
                  : formatPrice(current.methods[value].deliveryFee, locale)
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
            id={fieldId('street')}
            requiredMark={copy.requiredMark}
            label={copy.addressStreet}
            defaultValue={state?.values?.street}
            error={errors.street ? copy.errors[errors.street] : null}
            autoComplete="street-address"
            required
          />

          <div className={styles.pair}>
            <Field
              name="city"
              id={fieldId('city')}
              requiredMark={copy.requiredMark}
              label={copy.addressCity}
              defaultValue={state?.values?.city}
              error={errors.city ? copy.errors[errors.city] : null}
              autoComplete="address-level2"
              required
            />

            <Field
              name="postalCode"
              id={fieldId('postalCode')}
              requiredMark={copy.requiredMark}
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
          id={fieldId('name')}
          requiredMark={copy.requiredMark}
          label={copy.buyerName}
          defaultValue={state?.values?.name}
          error={errors.name ? copy.errors[errors.name] : null}
          autoComplete="name"
          required
        />

        <div className={styles.pair}>
          <Field
            name="email"
            id={fieldId('email')}
            requiredMark={copy.requiredMark}
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
            id={fieldId('phone')}
            requiredMark={copy.requiredMark}
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
            <bdi>{formatPrice(current.subtotal, locale)}</bdi>
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
      {/*
        The total on the screen, in agorot, so the server can refuse to charge
        anything else. It is only ever compared — the amount charged is computed
        from the database again — so a buyer who edits it gains nothing but a
        request to confirm the real figure.
      */}
      <input type="hidden" name="expectedTotalAgorot" value={chosen.totalAgorot} />

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
function DeliveryChoice({ id, value, checked, onChange, label, note, price }) {
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
 *
 * **And the marker beside the label is what tells everybody else.** The
 * attribute above is announced by assistive technology and is invisible, so
 * before this a sighted buyer had nothing at all saying which fields they had
 * to fill — every one of them, as it happens, which is exactly the case where
 * it goes unnoticed for a long time. Labels or instructions, Level A.
 *
 * It is `aria-hidden` because `required` has already said it: without that a
 * screen reader reads the field as "Full name required, required, edit text".
 * The marker is the *visible* half of a fact the markup already carries, which
 * is also why it follows the `required` prop rather than being a sentence at
 * the top of the form promising something about fields it cannot see.
 */
function Field({
  id,
  name,
  label,
  error,
  type = 'text',
  defaultValue,
  /* Pulled out of `rest` deliberately: spread onto the <input> it would be an
     unknown DOM attribute, which React reports at every render. */
  requiredMark,
  ...rest
}) {
  const errorId = id + '-error';

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {rest.required ? (
          <span className={styles.required} aria-hidden="true">
            {requiredMark}
          </span>
        ) : null}
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
