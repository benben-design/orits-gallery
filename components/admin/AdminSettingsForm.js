'use client';

import { useActionState, useRef } from 'react';
import { Save } from 'lucide-react';
import {
  FieldError,
  TranslationControls,
  useTranslatedField,
  readValue,
} from './translated-field';
import styles from './AdminWorkForm.module.css';

/**
 * The site settings, as one form. **The thirteenth client component**, and a
 * client one for the reason every admin form is: a rejected save has to come
 * back with the errors marked *and what she typed still in the boxes*.
 *
 * **It looks exactly like the work form because it is built from the same
 * parts** — the same stylesheet, the same field and error wiring, and the same
 * translation flow for the About text, imported from `translated-field.js`
 * rather than written again. She writes the Hebrew; leaving the field
 * translates it into the English box, marked unapproved; the save button stays
 * disabled until she has approved or edited it. See `useTranslatedField` for
 * the rules that keep that from being infuriating.
 *
 * Every string is a prop, resolved from the Hebrew dictionary on the server.
 * The action returns error codes; this component turns them into sentences.
 *
 * **There is no success state here**, for the reason the work form has none:
 * a save redirects back to this page with `?saved=1`, and the page — a server
 * component — says so. The page also keys this form on the values it owns, so
 * after a save that changed them it mounts afresh from what the database now
 * holds rather than keeping the text she typed. What she sees after saving is what was stored,
 * normalised WhatsApp number and all.
 */
export default function AdminSettingsForm({
  action,
  labels,
  translationLabels,
  initialValues,
  /** Whether a translation key is configured — see AdminWorkForm. */
  translationAvailable = false,
}) {
  const [state, formAction, isPending] = useActionState(action, { status: 'idle' });

  const errors = state.errors ?? {};

  /**
   * After a rejected save, what she typed; otherwise what is stored. The order
   * matters for the same reason it does on the work form.
   */
  const values = state.values ?? initialValues;

  const errorFor = (field) =>
    errors[field] ? labels.errors[errors[field]] ?? labels.errors.unexpected : null;

  const aboutHeRef = useRef(null);

  const aboutTranslation = useTranslatedField({
    english: values.aboutEn,
    source: values.aboutHe,
    enabled: translationAvailable,
    kind: 'about',
  });

  const field = (name) => ({
    id: name,
    name,
    defaultValue: values[name] ?? '',
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby':
      [errors[name] ? name + '-error' : null, labels.hints[name] ? name + '-hint' : null]
        .filter(Boolean)
        .join(' ') || undefined,
  });

  /** A hint under a field, when the field has one. */
  const hint = (name) =>
    labels.hints[name] ? (
      <p className={styles.hint} id={name + '-hint'}>
        {labels.hints[name]}
      </p>
    ) : null;

  const englishPending = aboutTranslation.pending;

  return (
    <form action={formAction} className={styles.form}>
      {state.status === 'error' ? (
        <p className={styles.formError} role="alert">
          {errors.form ? labels.errors[errors.form] : labels.errors.summary}
        </p>
      ) : null}

      {/* ---- About -------------------------------------------------- */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.about}</legend>

        {hint('about')}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="aboutHe">
            {labels.aboutHe}
          </label>
          {/* Translated when she leaves the field, never while she types. */}
          <textarea
            className={styles.textarea}
            rows={8}
            ref={aboutHeRef}
            onBlur={(event) => aboutTranslation.onSourceBlur(event.target.value)}
            {...field('aboutHe')}
          />
          <FieldError name="aboutHe" message={errorFor('aboutHe')} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="aboutEn">
            {labels.aboutEn}
          </label>
          <textarea
            rows={8}
            dir="ltr"
            id="aboutEn"
            name="aboutEn"
            value={aboutTranslation.value}
            onChange={(event) => aboutTranslation.onEdit(event.target.value)}
            className={
              englishPending ? styles.textarea + ' ' + styles.unapproved : styles.textarea
            }
            aria-invalid={errors.aboutEn ? 'true' : undefined}
            aria-describedby={
              [
                errors.aboutEn ? 'aboutEn-error' : null,
                englishPending ? 'aboutEn-pending' : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          {translationAvailable ? (
            <TranslationControls
              name="aboutEn"
              labels={translationLabels}
              translation={aboutTranslation}
              onRequest={() => aboutTranslation.onRequest(readValue(aboutHeRef))}
            />
          ) : null}
          <FieldError name="aboutEn" message={errorFor('aboutEn')} />
        </div>
      </fieldset>

      {/* ---- Contact ------------------------------------------------ */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.contact}</legend>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            {labels.email}
          </label>
          {/*
            Latin text inside a right-to-left page, like the login fields. Not
            type="email": the browser would refuse a half-typed address with a
            message of its own, and every message on this form is ours, in
            Hebrew. There is no format rule to enforce anyway — see the input
            module.
          */}
          <input
            className={styles.input}
            type="text"
            inputMode="email"
            dir="ltr"
            {...field('email')}
          />
          <FieldError name="email" message={errorFor('email')} />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="phone">
              {labels.phone}
            </label>
            <input className={styles.input} type="tel" dir="ltr" {...field('phone')} />
            <FieldError name="phone" message={errorFor('phone')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="whatsappNumber">
              {labels.whatsappNumber}
            </label>
            <input
              className={styles.input}
              type="tel"
              dir="ltr"
              {...field('whatsappNumber')}
            />
            {hint('whatsappNumber')}
            <FieldError name="whatsappNumber" message={errorFor('whatsappNumber')} />
          </div>
        </div>
      </fieldset>

      {/* ---- Social ------------------------------------------------- *
        type="text", not "url": the browser's own url check refuses
        "instagram.com/orit" in English before the action ever sees it, and
        the action accepts it — it adds the https:// she left off.
      */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.social}</legend>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="instagramUrl">
            {labels.instagramUrl}
          </label>
          <input
            className={styles.input}
            type="text"
            inputMode="url"
            dir="ltr"
            {...field('instagramUrl')}
          />
          <FieldError name="instagramUrl" message={errorFor('instagramUrl')} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="facebookUrl">
            {labels.facebookUrl}
          </label>
          <input
            className={styles.input}
            type="text"
            inputMode="url"
            dir="ltr"
            {...field('facebookUrl')}
          />
          <FieldError name="facebookUrl" message={errorFor('facebookUrl')} />
        </div>

        {hint('social')}
      </fieldset>

      {/* ---- Delivery ----------------------------------------------- *
        The rate is not marked required, deliberately: the browser would
        answer an empty box with a message of its own, and the action answers
        it with ours.
      */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.delivery}</legend>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="shippingFee">
              {labels.shippingFee}
            </label>
            <input
              className={styles.input}
              type="text"
              inputMode="decimal"
              dir="ltr"
              {...field('shippingFee')}
            />
            {hint('shippingFee')}
            <FieldError name="shippingFee" message={errorFor('shippingFee')} />
          </div>
        </div>

        {/*
          A checkbox rather than two radios: pickup is on or off, and a ticked
          box saying "offer self-pickup" is the plainest way to say which.
        */}
        <div className={styles.checkboxField}>
          <input
            className={styles.checkbox}
            type="checkbox"
            id="selfPickupOffered"
            name="selfPickupOffered"
            defaultChecked={values.selfPickupOffered === 'on'}
            aria-describedby="selfPickupOffered-hint"
          />
          <label className={styles.checkboxLabel} htmlFor="selfPickupOffered">
            {labels.selfPickupOffered}
          </label>
        </div>
        {hint('selfPickupOffered')}
      </fieldset>

      {/* ---- Saving -------------------------------------------------- *
        The same gate as the work form, for the same reason: a disabled button
        rather than a refusal inside the action, because letting the submit
        through would run React's form reset and empty every uncontrolled box.
      */}
      <div className={styles.submitRow}>
        {englishPending ? (
          <p className={styles.blocked} role="status">
            {translationLabels.blocked}{' '}
            <a className={styles.blockedLink} href="#aboutEn">
              {labels.aboutEn}
            </a>
          </p>
        ) : null}

        <button
          type="submit"
          className={styles.submit}
          disabled={isPending || englishPending}
        >
          <Save size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>{isPending ? labels.submitting : labels.save}</span>
        </button>
      </div>
    </form>
  );
}
