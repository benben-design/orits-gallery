import { useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import styles from './AdminWorkForm.module.css';

/**
 * A Hebrew field whose English twin writes itself, and the gate that makes her
 * read it — shared by every admin form that asks for both languages.
 *
 * **Moved here from AdminWorkForm unchanged**, when the site settings' About
 * text became the second form to need it. The brief was to reuse the work
 * form's flow as it is, and one copy is what makes "as it is" stay true: a
 * second implementation of the approval gate is the first place it would drift.
 *
 * No `'use client'` of its own. It is only ever imported by client components,
 * which makes it client code already, and a directive here would mark a
 * boundary that nothing crosses.
 *
 * The styles are the work form's, deliberately: the two forms are one visual
 * language, and a second stylesheet for the same controls would be a second
 * place to keep in step.
 */

/**
 * Where the browser asks for a translation.
 *
 * Under `/admin` because the session cookie is scoped to that path: the same
 * handler one segment outside it would receive no cookie and refuse her every
 * time. The handler itself is app/(admin)/admin/api/translate/route.js.
 */
const TRANSLATE_ENDPOINT = '/admin/api/translate';

/**
 * The sentence under a field the server rejected.
 *
 * Module scope, not defined inside the form: a component created during render
 * is a new type on every render, so React unmounts and remounts it each time —
 * which throws away focus, and is why the lint rule exists.
 */
export function FieldError({ name, message }) {
  if (!message) return null;

  return (
    <p className={styles.fieldError} id={name + '-error'}>
      {message}
    </p>
  );
}

/**
 * An English field that fills itself in from its Hebrew twin.
 *
 * She writes in Hebrew. Left to itself that means every English box is either
 * empty or a chore, so leaving a Hebrew field translates the **whole** field in
 * one go and drops the result into its English counterpart. Never per keystroke:
 * a translation of half a sentence is wasted quota and a flickering box.
 *
 * Two pieces of state decide everything, and neither is stored in the database —
 * this is form state, and what gets saved is simply the text she approved:
 *
 *   - **`pending`** — a translation has arrived and she has not looked at it
 *     yet. The form refuses to save while any field is in this state. That gate
 *     is the entire point: without it she can save a machine translation she
 *     never read, which is what this exists to prevent. Approving clears it, and
 *     so does editing, because editing means she read it.
 *   - **`hers`** — whose words are in the box. True the moment she types in it,
 *     and true on load for a stored value, whose provenance we cannot know and
 *     must not gamble on. **Automatic translation only ever replaces the
 *     machine's own text**, so re-editing the Hebrew never destroys a sentence
 *     she wrote. The button is how she asks for a fresh one anyway.
 *
 * Emptying the box hands it back to the machine: there is nothing of hers left
 * in it to protect.
 */
export function useTranslatedField({ english, source, enabled, kind }) {
  const [value, setValue] = useState(english ?? '');
  const [pending, setPending] = useState(false);
  /** 'idle' | 'translating' | 'failed' | 'noSource' */
  const [phase, setPhase] = useState('idle');

  const hers = useRef(Boolean((english ?? '').trim()));

  /**
   * The Hebrew the box was last translated from, seeded with what the work
   * already holds. It keeps opening a work and tabbing through it from spending
   * a translation on text nobody changed — automatic translation follows an
   * edit to the Hebrew, not a visit to the field.
   */
  const translatedFrom = useRef((source ?? '').trim() || null);

  /**
   * Which request the box is waiting for. Bumped when she types as well as when
   * a new request goes out, so an answer that lands after she has started
   * writing is dropped rather than typed over her.
   */
  const requestId = useRef(0);

  async function translate(rawSource) {
    const text = rawSource.trim();

    if (!text) {
      setPhase('noSource');
      return;
    }

    const id = (requestId.current += 1);
    translatedFrom.current = text;
    setPhase('translating');

    let translated = null;

    try {
      const response = await fetch(TRANSLATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 'title', 'description' or 'about' — a painting title has to come
        // back a noun phrase rather than a sentence, and this side is the only
        // one that knows which field is asking. The set is owned by
        // lib/translate.js and checked by the endpoint; it is a literal here
        // because importing that module would ship it, and the key it reads,
        // into the browser.
        body: JSON.stringify({ text, kind }),
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload?.ok && typeof payload.text === 'string') translated = payload.text;
      }
    } catch {
      // Offline, or the request never landed. Every failure is the same failure
      // here: nothing arrives, nothing is waiting for approval, and she types
      // the English herself and saves. A translation service having a bad
      // afternoon must not be able to trap her in the form.
    }

    if (id !== requestId.current) return;

    if (translated === null) {
      // Forgotten on purpose, so that leaving the Hebrew field again retries
      // instead of remembering one bad minute for the rest of the session.
      translatedFrom.current = null;
      setPhase('failed');
      return;
    }

    setPhase('idle');
    setValue(translated);
    setPending(true);
    hers.current = false;
  }

  return {
    value,
    pending,
    phase,

    /** She typed in the English box. It is hers, and nothing overwrites it. */
    onEdit(next) {
      requestId.current += 1;
      setValue(next);
      hers.current = next.trim().length > 0;
      setPending(false);
      setPhase('idle');
    },

    /** Read and accepted as it stands. */
    approve() {
      setPending(false);
    },

    /** Leaving the Hebrew field: the one moment an automatic translation runs. */
    onSourceBlur(rawSource) {
      if (!enabled) return;

      const text = rawSource.trim();
      if (!text) return;
      if (hers.current) return;
      if (text === translatedFrom.current) return;

      translate(text);
    },

    /** The explicit ask, which overwrites her English because she asked it to. */
    onRequest(rawSource) {
      translate(rawSource);
    },
  };
}

/**
 * The controls under an English field: what is waiting for her, and the way to
 * ask for another translation.
 *
 * Module scope for the same reason `FieldError` is.
 */
export function TranslationControls({ name, labels, translation, onRequest }) {
  return (
    <div className={styles.translation}>
      {translation.pending ? (
        <p className={styles.unapprovedNote} id={name + '-pending'} role="status">
          {labels.pending}
        </p>
      ) : null}

      <div className={styles.translationActions}>
        {translation.pending ? (
          <button type="button" className={styles.approve} onClick={translation.approve}>
            <Check size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{labels.approve}</span>
          </button>
        ) : null}

        <button
          type="button"
          className={styles.textButton}
          onClick={onRequest}
          disabled={translation.phase === 'translating'}
        >
          <Languages size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{labels.translate}</span>
        </button>

        {translation.phase === 'translating' ? (
          <span className={styles.hint}>{labels.translating}</span>
        ) : null}
      </div>

      {/*
        A failure is stated and then got out of the way. It is not an error on
        her part and there is nothing to fix: the English box is simply empty and
        she fills it in, exactly as she would have before any of this existed.
      */}
      {translation.phase === 'failed' ? (
        <p className={styles.hint} role="status">
          {labels.failed}
        </p>
      ) : null}

      {translation.phase === 'noSource' ? (
        <p className={styles.hint} role="status">
          {labels.noSource}
        </p>
      ) : null}
    </div>
  );
}

/** The text sitting in one of the uncontrolled Hebrew boxes right now. */
export function readValue(ref) {
  return ref.current ? ref.current.value : '';
}
