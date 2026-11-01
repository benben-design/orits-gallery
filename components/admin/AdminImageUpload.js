'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import { interpolate } from '@/lib/i18n/interpolate';
import { ACCEPT_ANY_IMAGE, checkFile, uploadToHost } from './image-upload';
import styles from './AdminImageUpload.module.css';

/**
 * The main image of one painting: what it is now, and how to replace it.
 *
 * **The file never passes through our server.** A Server Action caps its
 * request body at 1MB, and a photograph of a painting is several times that, so
 * the browser posts the file straight to the image host and the server brackets
 * it: `signAction` authorises the upload beforehand, `saveAction` records it
 * afterwards. Both are Server Actions — no URL, POST only, each verifying the
 * session itself. See app/(admin)/admin/actions.js and lib/image-host.js.
 *
 * The sequence, and every step of it can fail in a way she is told about:
 *
 *   1. Check the file here, before a byte is sent.
 *   2. Ask our server to sign an upload.
 *   3. Upload to the host, showing how far along it is.
 *   4. Ask our server to record it. The server asks the host how big the image
 *      actually is rather than believing what this component could report.
 *
 * **A client component because every part of it is interaction**: choosing a
 * file, reading its dimensions in the browser, watching a percentage climb.
 * None of that has a server-rendered form, which is also why this is the one
 * thing in the admin that genuinely does not work without JavaScript — and why
 * it sits outside the work form rather than inside it. The form still saves the
 * whole record with no script at all.
 *
 * Every string is a prop, resolved from the Hebrew dictionary on the server.
 * The limits arrive as numbers for the same reason the closed sets do: the
 * module that owns them reads `node:crypto` and cannot be imported here.
 */
export default function AdminImageUpload({
  labels,
  alt,
  /** The work's current main image, or null when it has none yet. */
  initialImage = null,
  signAction,
  /**
   * Records a finished upload against an existing work, its id already bound.
   *
   * **Its absence is what makes this the create page's panel.** With it, an
   * upload saves the moment it lands; without it there is no work to save
   * against, so the reference is held in `fieldName` below and written when the
   * form is submitted. One condition decides both the behaviour and the wording,
   * so the two cannot describe different things.
   */
  saveAction = null,
  /**
   * The hidden field carrying the uploaded reference into the create form, and
   * the id of the form to put it in.
   *
   * The panel sits *outside* the `<form>` on purpose — see AdminWorkForm — so
   * association is by the `form` attribute rather than by nesting. A hidden
   * text field is nothing like the file input that had to stay out: it is a
   * short identifier, not a photograph, and the 1MB body cap is not in play.
   */
  fieldName,
  formId,
  maxBytes,
  maxPixels,
  maxMegabytes,
  maxMegapixels,
  /**
   * The formats the host will take, from `ALLOWED_UPLOAD_FORMATS` in
   * lib/image-host.js, handed in by the page like the limits above. The
   * signature and the read-back enforce it too; this is only so a GIF is
   * refused with a sentence before it is sent, rather than by the host in the
   * middle of an upload.
   */
  allowedFormats,
}) {
  const router = useRouter();

  const [image, setImage] = useState(initialImage);
  /** 'idle' | 'uploading' | 'saving' | 'done' | 'error' */
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  /** True while a file is being dragged over the panel. */
  const [dragging, setDragging] = useState(false);
  /** Creating only: the uploaded reference, waiting for the form to be saved. */
  const [publicId, setPublicId] = useState('');

  const busy = status === 'uploading' || status === 'saving';

  /**
   * Whether a finished upload is stored on the spot or waits for the form.
   *
   * Read from `saveAction` rather than from a separate mode flag, so the
   * sentence the panel shows and the thing it actually does are the same fact.
   */
  const savesOnUpload = Boolean(saveAction);

  async function onFileChosen(event) {
    const file = event.target.files?.[0];

    /**
     * Clearing the input is what makes choosing the same file twice work.
     * Without it a second attempt after a failure fires no change event at all,
     * and the control looks dead.
     */
    event.target.value = '';
    if (file) await handleFile(file);
  }

  /* ---- Dragging a file onto the panel ------------------------------- *
   *
   * A second way in, not a replacement: the file input stays, because dragging
   * cannot be done from a keyboard and does not exist on a phone at all.
   * Everything past "there is a File" is the one path below, so this adds a
   * source rather than a second pipeline.
   */

  function onDragOver(event) {
    /**
     * **Without this the browser navigates away and opens the image.** That is
     * the default action for a drop anywhere on a page, and preventing it on
     * *dragover* — not only on drop — is what marks this element as somewhere a
     * file may be released. Miss it and the admin simply disappears mid-edit.
     */
    event.preventDefault();
    if (!busy) setDragging(true);
  }

  function onDragLeave(event) {
    /**
     * `dragleave` fires every time the pointer crosses into a child element, so
     * clearing the state unconditionally makes the outline flicker as the file
     * passes over the thumbnail and the hint. `relatedTarget` is what is being
     * entered; if it is still inside the panel, the file has not left.
     */
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDragging(false);
  }

  async function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;

    // The first file only. A work has exactly one main image, so several
    // dropped at once is not a thing this can honour.
    const file = event.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  }

  /**
   * One file, from wherever it came: checked, signed for, uploaded, recorded.
   *
   * Shared by the input and the drop handler deliberately — `accept` on the
   * input is a filter on a dialogue and has no say over what gets dropped, so a
   * dropped PDF has to be refused by the same check that refuses a chosen one.
   */
  async function handleFile(file) {
    setError(null);
    setProgress(0);

    const rejection = await checkFile(file, {
      maxBytes,
      maxPixels,
      maxMegabytes,
      maxMegapixels,
      allowedFormats,
    });

    if (rejection) {
      setStatus('error');
      setError(rejection);
      return;
    }

    setStatus('uploading');

    const signed = await signAction();
    if (!signed.ok) {
      setStatus('error');
      setError({ code: signed.error });
      return;
    }

    let uploaded;

    try {
      uploaded = await uploadToHost(signed, file, setProgress);
    } catch (uploadError) {
      console.error('[admin] image upload failed', uploadError);
      setStatus('error');
      setError({ code: 'uploadFailed' });
      return;
    }

    /**
     * **Creating a work: the photograph waits for the form.**
     *
     * There is nothing to attach it to yet — a work has no id until it is
     * saved, and `saveAction` takes that id as a bound argument. So the
     * reference goes into a hidden field and travels with the save, and the
     * work and its photograph are written in one transaction on the server.
     *
     * Which means it is genuinely **not saved yet**, and the panel says so
     * rather than borrowing the edit page's wording. Telling her a file is
     * safely stored while it is still only in a form field is how a person
     * closes a tab and loses it.
     */
    if (!saveAction) {
      setPublicId(uploaded.publicId);
      setImage({
        src: uploaded.previewUrl,
        width: uploaded.previewWidth,
        height: uploaded.previewHeight,
      });
      setStatus('done');
      return;
    }

    setStatus('saving');

    const saved = await saveAction(uploaded.publicId);
    if (!saved.ok) {
      setStatus('error');
      setError({ code: saved.error });
      return;
    }

    setImage(saved.image);
    setStatus('done');

    /**
     * The work now looks different on the works list, the gallery, the homepage
     * and its own page. The action revalidated those; this re-renders the page
     * she is standing on, whose heading and preview link were produced before
     * the upload existed.
     */
    router.refresh();
  }

  /*
    A code with no sentence falls back to the general one rather than nothing:
    a failure she cannot see is worse than one described vaguely.
  */
  const message = error
    ? interpolate(labels.errors[error.code] ?? labels.errors.unexpected, error.values ?? {})
    : null;

  return (
    <section
      className={[styles.panel, dragging ? styles.dragging : ''].filter(Boolean).join(' ')}
      aria-labelledby="main-image-heading"
      /*
        The whole panel is the drop target rather than a marked-out square
        inside it: it is a much bigger thing to hit, and a drop zone you can
        miss is worse than not offering one. `dragEnter` shares `dragOver`'s
        handler because both have to call preventDefault for this to be a place
        a file may be released at all.
      */
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <h2 className={styles.heading} id="main-image-heading">
        {labels.legend}
      </h2>

      <div className={styles.body}>
        <ArtworkFrame
          image={image}
          alt={alt}
          emptyLabel={labels.none}
          sizes="9rem"
          className={styles.thumbnail}
        />

        <div className={styles.controls}>
          <label className={styles.field}>
            <span className={styles.label}>
              {image ? labels.replace : labels.choose}
            </span>
            {/*
              A plain file input, styled through ::file-selector-button rather
              than replaced by a button that clicks a hidden one. The native
              control already carries the keyboard behaviour, the filename and
              the accessible name, and none of that is worth rebuilding.
            */}
            <input
              className={styles.input}
              type="file"
              accept={ACCEPT_ANY_IMAGE}
              disabled={busy}
              onChange={onFileChosen}
            />
          </label>

          {/*
            Says a file can be dragged in, and says it before she tries — a
            drop target nobody knows about is not a feature. The CSS hides this
            line where dragging is impossible, so a phone is not told about an
            interaction it cannot perform.
          */}
          <p className={styles.dragHint}>
            {dragging ? labels.dropNow : labels.dragHint}
          </p>

          <p className={styles.hint}>
            {interpolate(savesOnUpload ? labels.hint : labels.hintPending, {
              megabytes: maxMegabytes,
              megapixels: maxMegapixels,
            })}
          </p>

          {/*
            Creating only: what the form carries to the server. The value is an
            identifier, and the server treats it as a claim — it asks the host
            what the asset actually is before writing anything. See createWork.
          */}
          {!savesOnUpload && publicId ? (
            <input type="hidden" name={fieldName} form={formId} value={publicId} readOnly />
          ) : null}

          {/*
            A percentage rather than a spinner. This is the one place in the
            admin where she waits on a slow phone connection for something that
            may take a minute, and an indicator that cannot distinguish
            "working" from "stuck" is what makes a person upload the same file
            four times.
          */}
          {status === 'uploading' ? (
            <p className={styles.progress} role="status">
              <progress className={styles.bar} value={progress} max={100} />
              {interpolate(labels.uploading, { percent: progress })}
            </p>
          ) : null}

          {status === 'saving' ? (
            <p className={styles.progress} role="status">
              {labels.saving}
            </p>
          ) : null}

          {status === 'done' ? (
            <p className={styles.done} role="status">
              {savesOnUpload ? labels.done : labels.donePending}
            </p>
          ) : null}

          {message ? (
            <p className={styles.error} role="alert">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
