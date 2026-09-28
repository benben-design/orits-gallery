'use client';

import { useActionState, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import {
  FieldError,
  TranslationControls,
  useTranslatedField,
  readValue,
} from './translated-field';
import styles from './AdminWorkForm.module.css';

/**
 * The form's id, so a control rendered outside it can still be submitted with
 * it via the `form` attribute.
 *
 * Exported because the image panel is the thing that needs it, and a literal
 * repeated in two components is how the association quietly stops working —
 * silently, because a `form` attribute naming nothing is not an error, it just
 * leaves the field out of the post.
 */
export const FORM_ID = 'work-form';

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
 * **The English writes itself, and she signs it off.** Leaving a Hebrew field
 * translates it and fills its English twin, marked as not yet approved; the
 * form will not save while anything is in that state. See `useTranslatedField`
 * above for the two rules that make it bearable rather than infuriating.
 *
 * **The main image is attached above the form, not inside it** — see the
 * `imagePanel` prop. It saves on its own the moment a file finishes uploading,
 * because the file never travels with this form: a Server Action caps its
 * request body at 1MB and a photograph is several times that. Keeping it
 * outside the `<form>` element is not tidiness — a file input with a name
 * inside it would be serialised into the save and break every save with a body
 * that is too large.
 *
 * One thing is still deliberately absent:
 *
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
  /** 'create' or 'edit', which picks the button's wording. */
  mode = 'create',
  /**
   * Whether a translation key is configured, answered on the server.
   *
   * Off by default and off when there is no key, in which case the whole
   * feature is simply absent: no button, no attempt when a field is left, and
   * above all no failure message under every field she fills in. An install
   * without a key should look like this form did before translation existed,
   * not like a broken one.
   */
  translationAvailable = false,
  /**
   * The main-image panel, rendered above the form.
   *
   * A slot rather than something this component builds, for the same reason the
   * save action is a prop: it is the **edit** page that can offer it. A work has
   * no id until it is first saved, and an upload has nowhere to be recorded
   * without one — which is the flow the notice below already describes. The
   * new-work page passes nothing and gets that notice instead.
   *
   * It is also what the notice is replaced *by*, so the two can never both
   * appear: one says "attach a photograph later" and the other is where she
   * does it.
   */
  imagePanel = null,
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

  /**
   * The two translated pairs.
   *
   * The Hebrew boxes stay uncontrolled like every other field on this form; they
   * are read through a ref at the one moment their text is needed, which is when
   * she asks for a translation. Their English twins are controlled, because
   * something other than the person typing now writes into them.
   */
  const titleHeRef = useRef(null);
  const descriptionHeRef = useRef(null);

  const titleTranslation = useTranslatedField({
    english: values.titleEn,
    source: values.titleHe,
    enabled: translationAvailable,
    kind: 'title',
  });

  const descriptionTranslation = useTranslatedField({
    english: values.descriptionEn,
    source: values.descriptionHe,
    enabled: translationAvailable,
    kind: 'description',
  });

  /**
   * Everything waiting to be read. While this is not empty the form does not
   * save, and the band above the button says which field to go to.
   */
  const awaitingApproval = [
    { id: 'titleEn', label: labels.titleEn, pending: titleTranslation.pending },
    {
      id: 'descriptionEn',
      label: labels.descriptionEn,
      pending: descriptionTranslation.pending,
    },
  ].filter((entry) => entry.pending);

  const field = (name) => ({
    id: name,
    name,
    defaultValue: values[name] ?? '',
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby': errors[name] ? name + '-error' : undefined,
  });

  /**
   * The same wiring for a field the machine also writes into: controlled, and
   * described by whichever of its two notes are showing.
   */
  const translatedField = (name, translation, base) => ({
    id: name,
    name,
    value: translation.value,
    onChange: (event) => translation.onEdit(event.target.value),
    className: translation.pending ? base + ' ' + styles.unapproved : base,
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby':
      [
        errors[name] ? name + '-error' : null,
        translation.pending ? name + '-pending' : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined,
  });

  /**
   * **A successful save is not rendered here any more.** Both actions redirect
   * to the works list, so `status` only ever comes back `'error'` — there is no
   * `'created'` or `'saved'` branch because neither could be reached, and a
   * branch that cannot run is a claim about the code that is not true.
   *
   * The confirmation moved with the save: `app/(admin)/admin/(guarded)/page.js`
   * shows it, chosen by a code in the URL. Ending on the list is what the
   * artist asked for and it is also the better answer — the work is visible
   * there in the state she just gave it, and she cannot save the same thing
   * twice by sitting on a form that is finished with.
   */
  return (
    <>
      {/*
        Outside the <form>, and that placement is load-bearing rather than
        stylistic: the panel holds a file input, and a named file control inside
        this form would be serialised into the Server Action that saves the
        record — whose request body is capped at 1MB. The image saves itself the
        moment it uploads; this form saves everything else.
      */}
      {imagePanel ?? <p className={styles.notice}>{labels.imageNotice}</p>}

      {/*
        The id exists so the image panel above can put a hidden field **into**
        this form from outside it, using the `form` attribute — see
        AdminImageUpload. That is how a photograph chosen before the work exists
        travels with the save without the panel having to move inside the form
        and drag its file input in with it.
      */}
      <form id={FORM_ID} action={formAction} className={styles.form}>
        {state.status === 'error' ? (
          <p className={styles.formError} role="alert">
            {errors.form ? labels.errors[errors.form] : labels.errors.summary}
          </p>
        ) : null}

        {/* ---- The painting ------------------------------------------ */}
        <fieldset className={styles.group}>
          <legend className={styles.legend}>{labels.sections.painting}</legend>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="titleHe">
              {labels.titleHe}
            </label>
            {/*
              Translated when she leaves the field, and never while she is inside
              it. A title translated at every keystroke would be a flickering box
              and a hundred paid calls for one line of Hebrew.
            */}
            <input
              className={styles.input}
              type="text"
              required
              ref={titleHeRef}
              onBlur={(event) => titleTranslation.onSourceBlur(event.target.value)}
              {...field('titleHe')}
            />
            <FieldError name="titleHe" message={errorFor('titleHe')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="titleEn">
              {labels.titleEn}
            </label>
            {/* Latin text inside a right-to-left page, like the login fields. */}
            <input
              type="text"
              dir="ltr"
              required
              {...translatedField('titleEn', titleTranslation, styles.input)}
            />
            {translationAvailable ? (
              <TranslationControls
                name="titleEn"
                labels={labels.translation}
                translation={titleTranslation}
                onRequest={() => titleTranslation.onRequest(readValue(titleHeRef))}
              />
            ) : null}
            <FieldError name="titleEn" message={errorFor('titleEn')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="descriptionHe">
              {labels.descriptionHe}
            </label>
            <textarea
              className={styles.textarea}
              rows={4}
              ref={descriptionHeRef}
              onBlur={(event) => descriptionTranslation.onSourceBlur(event.target.value)}
              {...field('descriptionHe')}
            />
            <FieldError name="descriptionHe" message={errorFor('descriptionHe')} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="descriptionEn">
              {labels.descriptionEn}
            </label>
            <textarea
              rows={4}
              dir="ltr"
              {...translatedField('descriptionEn', descriptionTranslation, styles.textarea)}
            />
            {translationAvailable ? (
              <TranslationControls
                name="descriptionEn"
                labels={labels.translation}
                translation={descriptionTranslation}
                onRequest={() =>
                  descriptionTranslation.onRequest(readValue(descriptionHeRef))
                }
              />
            ) : null}
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
                /*
                  A sale through this site, shown as the answer to the same
                  question rather than as a sentence standing where the options
                  should be.

                  It is the one channel the admin never writes — checkout does,
                  and it is a claim that an order exists — so the radio is
                  `disabled`: checked, legible, and not hers to move. The
                  sentence below says why, because a control that cannot be used
                  and does not explain itself reads as one that is broken.

                  A disabled input submits nothing, which is exactly why the
                  hidden field beside it is load-bearing rather than belt and
                  braces: without it the channel would be absent from the
                  submission and the save would quietly erase it. A sale
                  recorded by checkout is not hers to retype, and dropping it
                  because the form declines to offer it would rewrite an order's
                  history.
                */
                <fieldset className={styles.choices}>
                  <legend className={styles.choicesLegend}>
                    {labels.saleChannelQuestion}
                  </legend>

                  <label className={[styles.choice, styles.choiceFixed].join(' ')}>
                    <input type="radio" checked disabled readOnly />
                    {options.automaticSaleChannelLabel}
                  </label>

                  <p className={styles.choicesNote}>{labels.saleChannelAutomatic}</p>

                  <input type="hidden" name="saleChannel" value={options.automaticSaleChannel} />
                </fieldset>
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
              aria-invalid={errors.publish ? 'true' : undefined}
              aria-describedby={errors.publish ? 'publish-error' : undefined}
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
          {/*
            The only error this box can carry: a work cannot be published
            without a photograph. It is refused on the act of publishing, so it
            never fires while saving a work that is already live — see the
            action.
          */}
          <FieldError name="publish" message={errorFor('publish')} />
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

        {/* ---- Saving -------------------------------------------------- *
          The gate. While a translation is unapproved the button is disabled and
          the band above it says so and names the fields, each one a link that
          jumps to it — the form is long, and "you cannot save" without "here is
          where to go" is how someone ends up phoning her son.

          A disabled button is the whole mechanism on purpose. Letting the submit
          through and refusing it inside the action would run React's form reset
          on the way past and empty every uncontrolled box on this form, which is
          a far worse outcome than a button she cannot press.
        */}
        <div className={styles.submitRow}>
          {awaitingApproval.length > 0 ? (
            <p className={styles.blocked} role="status">
              {labels.translation.blocked}{' '}
              {awaitingApproval.map((entry, index) => (
                <span key={entry.id}>
                  {index > 0 ? labels.translation.listSeparator : null}
                  <a className={styles.blockedLink} href={'#' + entry.id}>
                    {entry.label}
                  </a>
                </span>
              ))}
            </p>
          ) : null}

          <button
            type="submit"
            className={styles.submit}
            disabled={isPending || awaitingApproval.length > 0}
          >
            <Save size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>
              {isPending
                ? labels.submitting
                : mode === 'edit'
                  ? labels.save
                  : labels.submit}
            </span>
          </button>
        </div>
      </form>
    </>
  );
}
