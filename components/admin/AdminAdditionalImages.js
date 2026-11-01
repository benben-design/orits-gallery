'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import { interpolate } from '@/lib/i18n/interpolate';
import {
  ADDITIONAL_IMAGE_LIMIT,
  ADDITIONAL_IMAGES_FIELD,
  ADDITIONAL_IMAGES_SHOWN_FIELD,
} from '@/lib/data/work-input';
import { ACCEPT_ANY_IMAGE, checkFile, uploadToHost } from './image-upload';
import styles from './AdminAdditionalImages.module.css';

/**
 * Up to three more photographs of a work, beside its main one: a close-up, the
 * painting on a wall. Optional, and shown on both the new-work and edit pages.
 *
 * **Built for low volume.** One or two images every couple of weeks, so the
 * empty state is a heading and a single small tile to add one — never a row of
 * three empty slots waiting to be filled. Each image is a thumbnail with a
 * quiet remove beneath it, in the order she added them; at three the tile is
 * replaced by a sentence saying that is the limit, which is how the form
 * refuses a fourth.
 *
 * **Everything here is saved with the form**, on both pages. Unlike the main
 * image on the edit page, nothing is written the moment a file lands: adding
 * and removing are arrangements she confirms by saving, and the hint says so.
 * What travels is one hidden field per image — `existing:<id>` for one the work
 * already has, `upload:<public id>` for one just sent — and the server confirms
 * each before writing: the existing ones against this work's own rows, the new
 * ones by asking the host, exactly as for the main image. See
 * `resolveAdditionalImages` in app/(admin)/admin/actions.js.
 *
 * **The file goes from the browser to the host directly**, signed by the same
 * action as the main image, and is checked, sent and explained by the same
 * helpers (./image-upload.js) so the two panels cannot disagree about what a
 * good file is.
 *
 * It sits outside the `<form>`, beside the main-image panel, for the same
 * reason: a file input inside the form would be serialised into the save. Its
 * hidden fields join the form through the `form` attribute.
 *
 * **The add control is the native file input inside a label**, visually
 * hidden but still in the tab order, so the tile is a label for a real control
 * rather than a button that clicks a hidden one: the keyboard behaviour and the
 * accessible name are the platform's.
 */
export default function AdminAdditionalImages({
  labels,
  /** The image upload's labels — its error sentences are shared. */
  uploadLabels,
  alt,
  /** The work's current images beside the main one, in order. */
  initialImages = [],
  signAction,
  formId,
  maxBytes,
  maxPixels,
  maxMegabytes,
  maxMegapixels,
  allowedFormats,
}) {
  const [items, setItems] = useState(() =>
    initialImages.map((image) => ({
      key: image.id,
      entry: 'existing:' + image.id,
      src: image.src,
      width: image.width,
      height: image.height,
    }))
  );
  /** 'idle' | 'uploading' */
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  /** The last thing that happened, announced to a screen reader. */
  const [announcement, setAnnouncement] = useState('');
  const [dragging, setDragging] = useState(false);
  const addInputRef = useRef(null);

  const busy = status === 'uploading';
  const full = items.length >= ADDITIONAL_IMAGE_LIMIT;

  async function onFileChosen(event) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again after a failure still fires.
    event.target.value = '';
    if (file) await handleFile(file);
  }

  function onDragOver(event) {
    // Without this the browser opens the dropped image in place of the admin.
    event.preventDefault();
    if (!busy && !full) setDragging(true);
  }

  function onDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDragging(false);
  }

  async function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (busy || full) return;
    const file = event.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  }

  async function handleFile(file) {
    setError(null);
    setAnnouncement('');
    setProgress(0);

    const rejection = await checkFile(file, {
      maxBytes,
      maxPixels,
      maxMegabytes,
      maxMegapixels,
      allowedFormats,
    });

    if (rejection) {
      setError(rejection);
      return;
    }

    setStatus('uploading');

    const signed = await signAction();
    if (!signed.ok) {
      setStatus('idle');
      setError({ code: signed.error });
      return;
    }

    let uploaded;

    try {
      uploaded = await uploadToHost(signed, file, setProgress);
    } catch (uploadError) {
      console.error('[admin] additional image upload failed', uploadError);
      setStatus('idle');
      setError({ code: 'uploadFailed' });
      return;
    }

    /*
      The preview URL and size are the host's reply to this browser, used to
      show her the photograph and nothing else. What is stored is read back by
      the server on save.
    */
    setItems((current) =>
      current.length >= ADDITIONAL_IMAGE_LIMIT
        ? current
        : [
            ...current,
            {
              key: uploaded.publicId,
              entry: 'upload:' + uploaded.publicId,
              src: uploaded.previewUrl,
              width: uploaded.previewWidth,
              height: uploaded.previewHeight,
            },
          ]
    );
    setStatus('idle');
    setAnnouncement(labels.added);
  }

  function remove(key) {
    setItems((current) => current.filter((item) => item.key !== key));
    setError(null);
    setAnnouncement(labels.removed);
    /*
      The button that had focus is gone. The add control always exists after a
      removal — there are at most two images left — so focus goes there rather
      than falling to the top of the page.
    */
    requestAnimationFrame(() => addInputRef.current?.focus());
  }

  /*
    A code with no sentence falls back to the general one rather than nothing:
    a failure she cannot see is worse than one described vaguely.
  */
  const message = error
    ? interpolate(
        uploadLabels.errors[error.code] ?? uploadLabels.errors.unexpected,
        error.values ?? {}
      )
    : null;

  return (
    <section
      className={[styles.panel, dragging ? styles.dragging : ''].filter(Boolean).join(' ')}
      aria-labelledby="additional-images-heading"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <h2 className={styles.heading} id="additional-images-heading">
        {labels.legend}
      </h2>
      <p className={styles.hint}>{labels.hint}</p>

      <ul className={styles.strip}>
        {items.map((item, index) => (
          <li key={item.key} className={styles.item}>
            <ArtworkFrame
              image={{ src: item.src, width: item.width, height: item.height }}
              alt={alt}
              sizes="6rem"
              className={styles.thumbnail}
            />
            <button
              type="button"
              className={styles.remove}
              onClick={() => remove(item.key)}
              disabled={busy}
              aria-label={interpolate(labels.removeLabel, { number: index + 1 })}
            >
              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>{labels.remove}</span>
            </button>
          </li>
        ))}

        {full ? null : (
          <li className={styles.item}>
            <label className={styles.add}>
              <input
                ref={addInputRef}
                className={styles.fileInput}
                type="file"
                accept={ACCEPT_ANY_IMAGE}
                disabled={busy}
                onChange={onFileChosen}
              />
              {busy ? (
                <>
                  <progress className={styles.bar} value={progress} max={100} />
                  <span className={styles.addText} role="status">
                    {interpolate(labels.uploading, { percent: progress })}
                  </span>
                </>
              ) : (
                <>
                  <ImagePlus size={20} strokeWidth={1.5} aria-hidden="true" />
                  <span className={styles.addText}>{labels.add}</span>
                </>
              )}
            </label>
          </li>
        )}
      </ul>

      {full ? <p className={styles.hint}>{labels.full}</p> : null}

      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}

      <p className={styles.visuallyHidden} role="status">
        {announcement}
      </p>

      {/*
        What the form carries. The marker says the panel was on the page, so an
        empty list means "she removed them all" rather than "there was no panel".
      */}
      <input type="hidden" name={ADDITIONAL_IMAGES_SHOWN_FIELD} form={formId} value="1" readOnly />
      {items.map((item) => (
        <input
          key={item.key}
          type="hidden"
          name={ADDITIONAL_IMAGES_FIELD}
          form={formId}
          value={item.entry}
          readOnly
        />
      ))}
    </section>
  );
}
