'use client';

import { useActionState, useState } from 'react';
import styles from './AdminWorkForm.module.css';

/**
 * The sentence under a field the server rejected.
 *
 * Module scope, not defined inside the form: a component created during render
 * is a new type on every render, so React unmounts and remounts it each time —
 * which throws away focus, and is why the lint rule exists.
 */
function FieldError({ name, message }) {
  if (!message) return null;

  return (
    <p className={styles.fieldError} id={name + '-error'}>
      {message}
    </p>
  );
}

/**
 * The form for adding *or* editing a painting. **The fourth client
 * component**, and the second in the admin.
 *
 * **One form, two pages.** The field list, the validation codes and the Hebrew
 * labels are identical for creating and editing, so the action arrives as a
 * prop rather than being imported. A second copy would drift from this one the
 * first time a field was added to either.
 *
 * Client-side for the same reason the login form is: a rejected submission has
 * to come back with the errors marked *and everything she typed still in the
 * boxes*. Losing a filled-in form to one bad field is how a non-technical
 * person decides the admin is broken and phones her son.
 *
 * Every string is a prop, resolved from the Hebrew dictionary on the server.
 * The action returns error *codes*; this component turns them into sentences.
 * See i18n.md.
 *
 * Two things are deliberately absent:
 *
 *   - **No image field.** Upload is not built — Vercel's filesystem is
 *     read-only, so it needs image hosting first. A work is created without a
 *     photograph and gets one later, which is the order she works in anyway.
 *   - **No "featured" control.** At most one work may be featured and the
 *     database enforces it, so setting it means clearing the previous one in
 *     the same transaction. That is its own action, not a checkbox here.
 */
export default function AdminWorkForm({
  action,
  labels,
  options,
  today,
  /** Existing values when editing; absent when creating. */
  initialValues,
  /**
   * True once a work is public. Its slugs are then permanent, so the fields
   * are shown but not editable — see the note rendered beside them.
   */
  slugsLocked = false,
  /** 'create' or 'edit', which picks the button and the success wording. */
  mode = 'create',
}) {
  const [state, formAction, isPending] = useActionState(action, {
    status: 'idle',
  });

  const errors = state.errors ?? {};

  /**
   * What each box shows: whatever came back from a rejected submission, else
   * the work being edited, else empty. The order matters — after a failed save
   * she must see what she typed, not the values from before she typed them.
   */
  const values = state.values ?? initialValues ?? {};

  /** The message for one field, or nothing. */
  const errorFor = (field) =>
    errors[field] ? labels.errors[errors[field]] ?? labels.errors.unexpected : null;

  /**
   * Wires a field to its error and its previous value.
   *
   * `aria-invalid` and `aria-describedby` rather than colour alone — the same
   * rule the sale statuses follow, and the one that makes this usable with a
   * screen reader.
   */
  /**
   * The status as currently chosen, which decides whether the channel question
   * is asked at all.
   *
   * Initialised from the same values the boxes render with, so an existing sold
   * work opens with its channel already showing. Kept in state rather than read
   * off the DOM because the question below has to appear the moment she picks
   * sold, not on the next round trip.
   *
   * Without JavaScript the block simply reflects the status the page was
   * rendered with, and a missing channel saves as null — which is the correct
   * value for everything except a sale she is recording right now.
   */
  const [status, setStatus] = useState(values.status ?? '');

  /**
   * A sale through this site is written by checkout and is not hers to edit.
   * When a work already carries it, the block says so and passes the value
   * through untouched instead of offering a choice.
   */
  const channelIsAutomatic = values.saleChannel === options.automaticSaleChannel;

  const field = (name) => ({
    id: name,
    name,
    defaultValue: values[name] ?? '',
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby': errors[name] ? name + '-error' : undefined,
  });

  // Creating: the form is done with, and replacing it is the clearest possible
  // "that worked". Editing: she may well want to change something else, so the
  // form stays and the confirmation sits above it.
  if (state.status === 'created') {
    return (
      <p className={styles.success} role="status">
        {state.published ? labels.createdPublished : labels.createdDraft}
      </p>
    );
  }

  return (
    <form action={formAction} className={styles.form}>
      {state.status === 'saved' ? (
        <p className={styles.success} role="status">
          {state.published ? labels.savedPublished : labels.savedDraft}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className={styles.formError} role="alert">
          {errors.form ? labels.errors[errors.form] : labels.errors.summary}
        </p>
      ) : null}

      <p className={styles.notice}>{labels.imageNotice}</p>

      {/* ---- The painting ------------------------------------------ */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.painting}</legend>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="titleHe">
            {labels.titleHe}
          </label>
          <input className={styles.input} type="text" required {...field('titleHe')} />
          <FieldError name="titleHe" message={errorFor('titleHe')} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="titleEn">
            {labels.titleEn}
          </label>
          {/* Latin text inside a right-to-left page, like the login fields. */}
          <input
            className={styles.input}
            type="text"
            dir="ltr"
            required
            {...field('titleEn')}
          />
          <FieldError name="titleEn" message={errorFor('titleEn')} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="descriptionHe">
            {labels.descriptionHe}
          </label>
          <textarea className={styles.textarea} rows={4} {...field('descriptionHe')} />
          <FieldError name="descriptionHe" message={errorFor('descriptionHe')} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="descriptionEn">
            {labels.descriptionEn}
          </label>
          <textarea
            className={styles.textarea}
            rows={4}
            dir="ltr"
            {...field('descriptionEn')}
          />
          <FieldError name="descriptionEn" message={errorFor('descriptionEn')} />
        </div>
      </fieldset>

      {/* ---- Details ------------------------------------------------ */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.details}</legend>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="category">
              {labels.category}
            </label>
            <select className={styles.input} required {...field('category')}>
              {options.categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError name="category" message={errorFor('category')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="medium">
              {labels.medium}
            </label>
            <select className={styles.input} {...field('medium')}>
              <option value="">{labels.mediumNone}</option>
              {options.media.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError name="medium" message={errorFor('medium')} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="widthCm">
              {labels.widthCm}
            </label>
            <input
              className={styles.input}
              type="text"
              inputMode="decimal"
              dir="ltr"
              required
              {...field('widthCm')}
            />
            <FieldError name="widthCm" message={errorFor('widthCm')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="heightCm">
              {labels.heightCm}
            </label>
            <input
              className={styles.input}
              type="text"
              inputMode="decimal"
              dir="ltr"
              required
              {...field('heightCm')}
            />
            <FieldError name="heightCm" message={errorFor('heightCm')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="year">
              {labels.year}
            </label>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              dir="ltr"
              {...field('year')}
            />
            <FieldError name="year" message={errorFor('year')} />
          </div>
        </div>
      </fieldset>

      {/* ---- Price and availability --------------------------------- */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.pricing}</legend>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="price">
              {labels.price}
            </label>
            <input
              className={styles.input}
              type="text"
              inputMode="decimal"
              dir="ltr"
              required
              {...field('price')}
            />
            <FieldError name="price" message={errorFor('price')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="priceReduced">
              {labels.priceReduced}
            </label>
            <input
              className={styles.input}
              type="text"
              inputMode="decimal"
              dir="ltr"
              {...field('priceReduced')}
            />
            <p className={styles.hint}>{labels.priceReducedHint}</p>
            <FieldError name="priceReduced" message={errorFor('priceReduced')} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="status">
              {labels.status}
            </label>
            <select
              className={styles.input}
              required
              {...field('status')}
              onChange={(event) => setStatus(event.target.value)}
            >
              {options.statuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError name="status" message={errorFor('status')} />
          </div>
        </div>

        {/* ---- Where it sold, which is a question only "sold" asks ----- *
          Not a field sitting beside status: it follows from status, and only
          the sold status has an answer. Choosing anything else unmounts it,
          so the channel is simply absent from the submission and the record
          comes back null — an available work carrying "sold on under1000" is
          not a state that should be reachable by forgetting to clear a box.

          The database still does not tie the two columns, deliberately, so a
          work can be edited in either order. This is the form guiding her,
          not a new rule in the schema.
        */}
        {status === options.soldStatus ? (
          <div className={styles.followUp}>
            {channelIsAutomatic ? (
              <>
                <p className={styles.hint}>{labels.saleChannelAutomatic}</p>
                {/*
                  Carried through untouched. A sale recorded by checkout is not
                  hers to retype, and dropping it because the form declines to
                  offer it would quietly rewrite an order's history.
                */}
                <input type="hidden" name="saleChannel" value={options.automaticSaleChannel} />
              </>
            ) : (
              <fieldset className={styles.choices}>
                <legend className={styles.choicesLegend}>
                  {labels.saleChannelQuestion}
                </legend>

                {options.manualSaleChannels.map((option) => (
                  <label key={option.value} className={styles.choice}>
                    <input
                      type="radio"
                      name="saleChannel"
                      value={option.value}
                      defaultChecked={values.saleChannel === option.value}
                    />
                    {option.label}
                  </label>
                ))}

                <label className={styles.choice}>
                  <input
                    type="radio"
                    name="saleChannel"
                    value=""
                    defaultChecked={!values.saleChannel}
                  />
                  {labels.saleChannelNotRecorded}
                </label>
              </fieldset>
            )}
            <FieldError name="saleChannel" message={errorFor('saleChannel')} />
          </div>
        ) : null}
      </fieldset>

      {/* ---- Publishing --------------------------------------------- */}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{labels.sections.publishing}</legend>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="addedAt">
            {labels.addedAt}
          </label>
          <input
            className={styles.input}
            type="date"
            dir="ltr"
            required
            id="addedAt"
            name="addedAt"
            defaultValue={values.addedAt ?? today}
            aria-invalid={errors.addedAt ? 'true' : undefined}
            aria-describedby={errors.addedAt ? 'addedAt-error' : undefined}
          />
          <FieldError name="addedAt" message={errorFor('addedAt')} />
        </div>

        <div className={styles.checkboxField}>
          <input
            className={styles.checkbox}
            type="checkbox"
            id="publish"
            name="publish"
            defaultChecked={values.publish === 'on'}
          />
          <label className={styles.checkboxLabel} htmlFor="publish">
            {/*
              "Publish now" is a thing you do once. On an existing work the same
              checkbox is a statement about where it currently is, and unticking
              it is how she takes a painting off the site without deleting it.
            */}
            {mode === 'edit' ? labels.publishedLabel : labels.publish}
          </label>
        </div>
        <p className={styles.hint}>
          {mode === 'edit' ? labels.publishedHint : labels.publishHint}
        </p>
      </fieldset>

      {/* ---- The web address ---------------------------------------- *
        Folded away in a <details>, which needs no JavaScript. She should
        almost never open it — the address is made from the title — but it has
        to be reachable, because it is permanent once published and a bad one
        cannot be fixed afterwards without breaking links.
      */}
      <details className={styles.advanced}>
        <summary className={styles.summary}>{labels.sections.address}</summary>

        <p className={styles.hint}>
          {/*
            Two different explanations, because the situation is genuinely
            different. On a draft the address can still be changed; once the
            work is public it cannot, and saying so is the point — silently
            discarding her edit would leave her believing it had been saved.
          */}
          {slugsLocked ? labels.addressLockedHint : labels.addressHint}
        </p>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="slugHe">
              {labels.slugHe}
            </label>
            <input
              className={styles.input}
              type="text"
              readOnly={slugsLocked}
              {...field('slugHe')}
            />
            <FieldError name="slugHe" message={errorFor('slugHe')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="slugEn">
              {labels.slugEn}
            </label>
            <input
              className={styles.input}
              type="text"
              dir="ltr"
              readOnly={slugsLocked}
              {...field('slugEn')}
            />
            <FieldError name="slugEn" message={errorFor('slugEn')} />
          </div>
        </div>
      </details>

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending
          ? labels.submitting
          : mode === 'edit'
            ? labels.save
            : labels.submit}
      </button>
    </form>
  );
}
