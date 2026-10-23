'use server';

/**
 * Signing in and signing out.
 *
 * These are **Server Actions** — a Next thing rather than a plain React one.
 * The `'use server'` above marks every export as a function the browser may
 * invoke over a POST, while the body only ever runs on the server. The form
 * element is given the function itself rather than a URL.
 *
 * That is why there is no route handler here, and it is what api.md asks for:
 * an endpoint only when nothing else will do. It also settles two things for
 * free that a hand-written login endpoint has to get right:
 *
 *   - **The credentials never appear in a URL.** There is no query string to
 *     put them in and no GET to be bookmarked, logged by a proxy, or left in
 *     browser history.
 *   - **The form still works before the page's JavaScript has loaded**, because
 *     Next renders it as a real form post and replays it.
 */
import { redirect } from 'next/navigation';
import { revalidatePublicSite } from '@/lib/revalidate';
import { authenticateAdmin } from '@/lib/auth/admin-users';
import {
  startAdminSession,
  endAdminSession,
  readAdminSession,
} from '@/lib/auth/admin-session';
import {
  createWork as createWorkRecord,
  updateWork as updateWorkRecord,
  deleteWork as deleteWorkRecord,
  unpublishWork as unpublishWorkRecord,
  markWorkSold as markWorkSoldRecord,
  returnWorkToSale as returnWorkToSaleRecord,
  setMainImage as setMainImageRecord,
  getWorkById,
  DuplicateSlugError,
  WorkHasOrdersError,
} from '@/lib/data/works-repository';
import {
  validateWorkInput,
  IMAGE_PUBLIC_ID_FIELD,
  MANUAL_SALE_CHANNELS,
} from '@/lib/data/work-input';
import {
  advanceOrder as advanceOrderRecord,
  closeOrder as closeOrderRecord,
} from '@/lib/data/orders-repository';
import {
  updateSiteSettings as updateSiteSettingsRecord,
  setPortrait as setPortraitRecord,
} from '@/lib/data/settings-repository';
import { validateSettingsInput } from '@/lib/data/settings-input';
import { signImageUpload, readUploadedImage, UPLOAD_FOLDERS } from '@/lib/image-host';
import { safeReturnTo, ADMIN_LOGIN_PATH } from '@/lib/auth/admin-guard';
import { readClientIp } from '@/lib/auth/client-ip';
import {
  beginLoginAttempt,
  clearFailedLogins,
  MAX_EMAIL_LENGTH,
} from '@/lib/auth/login-throttle';

/**
 * The shape `useActionState` carries between submissions.
 *
 * A flag rather than a message: the copy lives in the locale files and is
 * chosen by the component, so this action never invents user-facing text. See
 * .claude/rules/i18n.md.
 *
 * It is not exported, because a `'use server'` module may only export async
 * functions — the form's initial state is declared in the component instead.
 */
const FAILED = { failed: true, reason: 'invalid' };

/**
 * Too many attempts. A separate reason so the form can say to wait rather than
 * repeating "wrong password" at someone who may well have typed it right.
 *
 * It carries no remaining time. A countdown would be a free progress bar for
 * whoever is guessing, and it would tell an attacker which addresses are worth
 * coming back to. It reads identically whatever address was submitted.
 */
const BLOCKED = { failed: true, reason: 'tooManyAttempts' };

export async function signIn(previousState, formData) {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') return FAILED;
  if (!email.trim() || !password) return FAILED;

  const ip = await readClientIp();

  // Counted BEFORE the password is verified, and that ordering is the whole
  // point: a limit that runs scrypt and only counts afterwards lets a burst of
  // simultaneous guesses all through before the first is recorded (measured:
  // 39 of 40). A blocked attempt does no hashing and touches no account. The
  // attempt is counted against the address as submitted, whether or not it
  // belongs to an account — counting only real accounts would make the site
  // behave differently for an address that exists.
  if (!(await beginLoginAttempt(email, ip))) return BLOCKED;

  // Longer than any address can be, so it belongs to no account. Refused
  // without running scrypt; it has already been counted above.
  if (email.trim().length > MAX_EMAIL_LENGTH) return FAILED;

  const account = await authenticateAdmin(email, password);

  // One failure, one answer. Whether the address is unknown or the password is
  // wrong, this returns the same thing and took about as long to do it — see
  // the decoy hash in lib/auth/admin-users.js. Nothing about the attempt is
  // written to the log either: a log line saying which email was tried is a
  // list of admin addresses sitting in a log.
  if (!account) return FAILED;

  // Proving the password clears all three counters — this address from this
  // source, this source, and this address from everywhere — so a person who
  // mistyped four times and then got it right starts from zero rather than one
  // attempt away from locking themselves out.
  await clearFailedLogins(email, ip);

  await startAdminSession(account.id);

  // Back to whatever was originally asked for. The value came from a form
  // field, which means the browser could have changed it, so it is narrowed
  // again here rather than trusted because the page already narrowed it —
  // safeReturnTo falls back to the dashboard for anything that is not a path
  // inside the admin.
  const destination = safeReturnTo(formData.get('returnTo'));

  // redirect() works by throwing, so it must sit outside any try/catch that
  // would swallow it — there is deliberately none in this function.
  redirect(destination);
}

export async function signOut() {
  await endAdminSession();
  redirect(ADMIN_LOGIN_PATH);
}

/* ------------------------------------------------------------------ *
 * Works
 * ------------------------------------------------------------------ */

/**
 * Where a successful save lands: the works list, carrying what just happened.
 *
 * **Saving ends on the list rather than on the form.** The record is written,
 * so the form has nothing left to say, and leaving her on it invites a second
 * save of the same thing. The list is where she can see the work sitting among
 * the others in the state she just gave it — which is a better confirmation
 * than a sentence claiming it worked.
 *
 * The outcome travels in the URL rather than through `useActionState`, exactly
 * as the delete flow carries its own — that is what lets the list stay a server
 * component, and it survives the redirect, which action state does not. It is a
 * code, and the list ignores one it has no sentence for.
 *
 * Not exported: a `'use server'` module may only export async functions.
 */
function savedPath(outcome) {
  return '/admin?saved=' + outcome;
}

/**
 * Creates a painting.
 *
 * **This verifies the session itself, and that is not belt-and-braces.** The
 * page guard in lib/auth/admin-guard.js runs when a *page* renders. A Server
 * Action is a POST endpoint Next reaches directly, and the guard has no say in
 * it — so a form behind a guarded page is not a protected write. Anyone who
 * knows the action's id can call this without ever loading the page. The check
 * below is the only thing standing there. See .claude/rules/security.md.
 *
 * Returns field-level error codes rather than messages, for the same reason
 * signIn returns a flag: the Hebrew lives in the locale files.
 */
export async function createWork(previousState, formData) {
  if (!(await readAdminSession())) {
    return { status: 'error', errors: { form: 'notSignedIn' } };
  }

  const submitted = Object.fromEntries(formData);
  const validated = validateWorkInput(submitted);

  if (!validated.ok) {
    // The values come back with the errors so the form can re-render what she
    // typed. Losing a filled-in form to one bad field is how someone gives up
    // on an admin.
    return { status: 'error', errors: validated.errors, values: submitted };
  }

  /**
   * The photograph, if she chose one while filling the form in.
   *
   * **The image reference travels as an ordinary form field, and it is not
   * trusted.** A work being created has no id to bind, so the reference rides
   * in the form — where the browser can edit it to name any asset in the
   * account, or something that is not an asset at all. (The edit page binds
   * the work's id instead, which is not tamper-proof either: see `updateWork`.)
   *
   * What makes that safe is the same thing that makes the edit path safe: the
   * identifier is all we take. The width, the height and the URL are read back
   * from the host under our own credentials, and a reference the host does not
   * recognise stops the save here rather than writing a broken row.
   */
  const publicId = formData.get(IMAGE_PUBLIC_ID_FIELD);
  let image = null;

  if (typeof publicId === 'string' && publicId.trim() !== '') {
    const asset = await readUploadedImage(publicId);

    if (!asset.ok) {
      console.error('[admin] createWork could not confirm the upload', asset.error);
      return {
        status: 'error',
        errors: { form: 'imageNotConfirmed' },
        values: submitted,
      };
    }

    image = asset.image;
  }

  /**
   * A painting cannot be published without a photograph.
   *
   * The same rule the edit page applies, and it can be satisfied here now: the
   * create form carries the image panel, so she can attach one and publish in a
   * single save. It refuses rather than quietly saving a draft — ignoring the
   * tick would leave her believing the work is live.
   *
   * Checked against the image that was actually **confirmed** above, not
   * against whether the form claimed one, so a reference the host could not
   * recognise cannot publish an empty frame.
   */
  if (validated.value.publish && !image) {
    return {
      status: 'error',
      errors: { publish: 'imageRequiredToPublishNew' },
      values: submitted,
    };
  }

  let created;

  try {
    // One transaction: the work and its photograph land together, or neither
    // does. See createWork in the repository.
    created = await createWorkRecord(validated.value, image);
  } catch (error) {
    if (error instanceof DuplicateSlugError) {
      return {
        status: 'error',
        errors: { [error.field]: 'duplicateSlug' },
        values: submitted,
      };
    }

    // The detail goes to the server log; she gets something she can act on.
    console.error('[admin] createWork failed', error);
    return { status: 'error', errors: { form: 'unexpected' }, values: submitted };
  }

  // Revalidate the public surfaces this work now appears on. Without it the
  // homepage grid and the gallery keep serving their cached render and she
  // reasonably concludes the save did not work.
  revalidatePublicSite();

  // redirect() works by throwing, so it must sit outside any try/catch that
  // would swallow it — the one above closed before this line.
  redirect(savedPath(created.publishedAt ? 'createdPublished' : 'createdDraft'));
}

/**
 * Saves changes to an existing painting.
 *
 * The work's id is a **bound argument**, not a form field — which keeps it out
 * of the form, and **does not** make it tamper-proof. Next encrypts the
 * variables an inline action closes over; `.bind()` values are sent to the
 * browser as plain data and posted back as the browser sends them. That is
 * acceptable for every admin action here, and for one reason only: the caller
 * must be signed in, and a signed-in admin may act on any work or order
 * anyway, so an edited id gives her nothing she did not have. Nothing public
 * may rely on a bound value; see security.md.
 *
 * Like `createWork`, **this verifies the session itself**. The guard on the
 * page that renders the form does not run for actions; anyone who knows this
 * action's id can post to it directly, and the check below is the only thing
 * standing there. See .claude/rules/security.md.
 */
export async function updateWork(workId, previousState, formData) {
  if (!(await readAdminSession())) {
    return { status: 'error', errors: { form: 'notSignedIn' } };
  }

  // Read the work first: whether its slugs may change depends on whether it is
  // already public, and that is not something the form is allowed to assert.
  const existing = await getWorkById(workId);
  if (!existing) return { status: 'error', errors: { form: 'notFound' } };

  const submitted = Object.fromEntries(formData);
  const validated = validateWorkInput(submitted);

  if (!validated.ok) {
    return { status: 'error', errors: validated.errors, values: submitted };
  }

  /**
   * A painting cannot be **published** without a photograph.
   *
   * Now that she can attach one, a published work with an empty frame is a
   * mistake rather than a state the admin forces on her, so it is refused.
   *
   * **The rule is about the act of publishing, not about saving.** It fires
   * only on the transition — publish ticked on a work that is not yet public —
   * and never on a work that is already live. That distinction is the whole
   * design: a rule written as "a published work must have an image" would stop
   * her fixing a typo on a work published before this existed, on a field
   * nobody touched. This project has met that trap before, in the 100cm size
   * limit that had to be deferred for exactly the same reason.
   *
   * The consequence, accepted: works already published without a photograph
   * stay published and stay editable. This closes the door; it does not go
   * back through it.
   */
  const isPublishing = validated.value.publish && !existing.publishedAt;

  if (isPublishing && !existing.images.some((image) => image.type === 'main')) {
    return {
      status: 'error',
      errors: { publish: 'imageRequiredToPublish' },
      values: submitted,
    };
  }

  /**
   * A published work's slugs are permanent.
   *
   * The form renders them read-only once a work is public, but read-only is a
   * property of an input and not of the request: this is the check that
   * actually holds. It **reports** the refusal rather than quietly writing the
   * old value back — she would otherwise save, see no error, and believe the
   * address had changed.
   *
   * Comparing against the validated slugs rather than the raw ones matters:
   * both sides have been through `slugify`, so re-submitting the same address
   * with different spacing is not mistaken for an edit.
   */
  if (existing.publishedAt) {
    const errors = {};
    if (validated.value.slugHe !== existing.slug.he) errors.slugHe = 'slugLocked';
    if (validated.value.slugEn !== existing.slug.en) errors.slugEn = 'slugLocked';

    if (Object.keys(errors).length > 0) {
      return { status: 'error', errors, values: submitted };
    }
  }

  let saved;

  try {
    saved = await updateWorkRecord(workId, validated.value);
  } catch (error) {
    if (error instanceof DuplicateSlugError) {
      return {
        status: 'error',
        errors: { [error.field]: 'duplicateSlug' },
        values: submitted,
      };
    }

    console.error('[admin] updateWork failed', error);
    return { status: 'error', errors: { form: 'unexpected' }, values: submitted };
  }

  if (!saved) return { status: 'error', errors: { form: 'notFound' } };

  // The work may have just appeared on, changed on, or vanished from the public
  // site. Without this she saves, looks at the gallery, sees the old version and
  // reasonably concludes it did not work.
  revalidatePublicSite();

  // As in createWork: outside the try/catch, which has already closed. Nothing
  // is echoed back to the form because the form is not what she sees next —
  // normalised slugs and all are rendered by the list she lands on.
  redirect(savedPath(saved.publishedAt ? 'savedPublished' : 'savedDraft'));
}

/**
 * Where the confirmation page lives, with an outcome attached.
 *
 * Errors travel back in the URL rather than through `useActionState`, which is
 * what keeps the confirmation page a **server** component: there is no typed
 * input to preserve across a failed attempt, only a code to render a sentence
 * from, and a code is not a credential. It also means the whole flow works with
 * no JavaScript at all — a link, a page, a form post.
 *
 * Not exported: a `'use server'` module may only export async functions.
 */
function confirmationPath(workId, outcome) {
  const path = '/admin/works/' + encodeURIComponent(workId) + '/delete';
  return outcome ? path + '?outcome=' + outcome : path;
}

/**
 * Back to the sale question, carrying why it did not happen.
 *
 * Same arrangement as the delete confirmation: a *code* in the query string,
 * never a sentence, so the Hebrew stays in the locale files and the page picks
 * the wording. A code the page has no sentence for renders nothing.
 */
function salePath(workId, outcome) {
  const path = '/admin/works/' + encodeURIComponent(workId) + '/sale';
  return outcome ? path + '?outcome=' + outcome : path;
}

/**
 * Deletes a painting, permanently.
 *
 * **Verifies the session itself**, like every other mutation here: the page
 * guard runs when a page renders and has no say over a Server Action, which is
 * a POST endpoint Next reaches directly. Anyone who knows this action's id can
 * call it without ever loading a page. See security.md.
 *
 * Two things it deliberately does not do:
 *
 *   - **It does not delete images.** `work_images.work_id` cascades in the
 *     schema, so they go with the row. A loop here would be a second place that
 *     has to be kept in step with the database.
 *   - **It does not check whether the work has been sold through this site.**
 *     `order_lines.work_id` is `on delete restrict`, so the database refuses and
 *     the repository turns that into `WorkHasOrdersError`. Reading the orders
 *     table first would be a check-then-act race and a second home for a rule
 *     the schema already enforces. No orders exist yet; when they do, this path
 *     is already correct rather than newly expensive. See commerce.md.
 *
 * @param {string} workId - Bound by the page. Not tamper-proof — see `updateWork`.
 */
export async function deleteWork(workId) {
  // No session: sign in. Nothing is deleted, and the answer says nothing about
  // whether a work by that id exists.
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  let deleted;

  try {
    deleted = await deleteWorkRecord(workId);
  } catch (error) {
    // redirect() throws, so these run outside the try's reach by construction.
    if (error instanceof WorkHasOrdersError) {
      redirect(confirmationPath(workId, 'ordered'));
    }

    console.error('[admin] deleteWork failed', error);
    redirect(confirmationPath(workId, 'unexpected'));
  }

  if (!deleted) redirect(confirmationPath(workId, 'notFound'));

  // The work may have just vanished from the gallery, the homepage grid and the
  // sitemap. Without this they keep serving their cached render and she
  // reasonably concludes the delete did not work.
  revalidatePublicSite();

  redirect('/admin');
}

/**
 * Takes a painting off the public site, without deleting anything.
 *
 * This is what the delete confirmation offers instead of deleting a published
 * work, and it is the same state unticking "published" in the edit form
 * produces — one meaning of unpublished, reached two ways.
 *
 * **Verifies the session itself**, for the same reason as above.
 *
 * @param {string} workId - Bound server-side.
 */
export async function unpublishWork(workId) {
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  const unpublished = await unpublishWorkRecord(workId);

  if (!unpublished) redirect(confirmationPath(workId, 'notFound'));

  revalidatePublicSite();

  // Back to the list, where it now reads as a draft. That is the confirmation:
  // she can see the state she asked for rather than being told about it.
  redirect('/admin');
}

/**
 * Marks a painting sold, and records which channel it went through.
 *
 * **This is the mitigation commerce.md calls the most prominent action in the
 * admin, and the reason it is its own action is the reason it matters.** Before
 * it, marking a work sold meant saving the whole edit form — and that form
 * refuses to save while any machine translation is unapproved. So a painting
 * sold at a fair could fail to be marked sold because an English description
 * generated a fortnight ago had never been read: a one-field change blocked by
 * a field she never touched, at exactly the moment the site is still offering a
 * painting that is gone.
 *
 * Nothing here parses a form or validates a record. Two columns move.
 *
 * **The channel is checked against `MANUAL_SALE_CHANNELS`, not
 * `SALE_CHANNELS`.** `this-site` is a claim that an order exists, written by
 * checkout and never by hand — and this is a POST endpoint the browser can
 * address directly, so the closed set has to be narrowed *here* rather than
 * only in the buttons that call it. See commerce.md.
 *
 * Its own session check, because the page guard has no say over an action. See
 * security.md.
 *
 * @param {string} workId - Bound by the page. Not tamper-proof — see `updateWork`.
 * @param {string} channel - Bound the same way, one per button, and narrowed to
 *   the manual channels below for exactly that reason.
 */
export async function markWorkSold(workId, channel) {
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  // A value from outside the set never reaches the database. The page offers
  // two buttons; this is what makes that a rule rather than a habit.
  if (!MANUAL_SALE_CHANNELS.includes(channel)) {
    redirect(salePath(workId, 'unknownChannel'));
  }

  const marked = await markWorkSoldRecord(workId, channel);

  /*
    False means one of two things, and they need different sentences: no work
    with that id, or a work that sold through this site — which this action must
    not overwrite, because that channel answers for an order.
  */
  if (!marked) {
    const work = await getWorkById(workId);
    redirect(salePath(workId, work ? 'siteSale' : 'notFound'));
  }

  // The gallery, the homepage grid and the artwork page all render this work's
  // status. Without this they keep serving their cached render and the site
  // goes on offering a painting that has gone.
  revalidatePublicSite();

  redirect(savedPath('markedSold'));
}

/**
 * Puts a painting back on sale after it was marked sold by hand.
 *
 * **The way back has to be as easy as the way in, or the mistake is harder to
 * undo than it was to make.** Without this the only route back is the edit
 * form — the same form, behind the same translation gate the action above
 * exists to get around.
 *
 * **It clears the channel**, which the repository does in the same statement:
 * an `available` work that still records where it sold is a contradiction
 * nothing complains about and everything later reads as true.
 *
 * **A sale through this site is refused, not confirmed harder.** Undoing a
 * hand-marked sale corrects a click; undoing one that went through checkout
 * asserts that money went back, against an order row saying it did not. A
 * heavier confirmation would still let her do it from a list of paintings, and
 * commerce.md is explicit that nothing which later happens to the catalogue may
 * change what an order says. The refusal is a sentence rather than a control
 * that silently does nothing.
 *
 * @param {string} workId - Bound server-side by the page.
 */
export async function returnWorkToSale(workId) {
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  const returned = await returnWorkToSaleRecord(workId);

  if (!returned) {
    const work = await getWorkById(workId);
    redirect(salePath(workId, work ? 'siteSale' : 'notFound'));
  }

  revalidatePublicSite();

  redirect(savedPath('returnedToSale'));
}

/* ------------------------------------------------------------------ *
 * The main image
 *
 * Two actions rather than one, because the file never passes through this
 * server. A Server Action's request body is capped at 1MB and the photographs
 * this exists for are several times that, so the browser uploads straight to
 * the image host and these two bracket it: one authorises the upload, the
 * other records what the host says arrived.
 *
 * Both verify the session in their own first lines. The page guard has no say
 * over an action — see security.md — and neither of these is an exception:
 * signing is a write endpoint into the artist's media library, and saving
 * writes a row.
 * ------------------------------------------------------------------ */

/**
 * Hands the browser a signature for one upload.
 *
 * Takes no work id, deliberately. Nothing about the signature names a work —
 * the folder is fixed and it is the only parameter signed besides the
 * timestamp — so accepting one would be an argument that reads as though it
 * constrained something and does not. Which work the file belongs to is
 * settled when it is saved, by `saveMainImage`, which takes the work's id.
 *
 * @returns {Promise<{ok: true, endpoint: string, fields: object} |
 *                   {ok: false, error: string}>}
 */
export async function signMainImageUpload() {
  if (!(await readAdminSession())) return { ok: false, error: 'notSignedIn' };

  return signImageUpload('works');
}

/**
 * Records an upload against a work, after asking the host what it actually is.
 *
 * @param {string} workId - Bound by the page that renders the form. Not
 *   tamper-proof — see `updateWork` — so a signed-in admin could repoint an
 *   upload at another painting, which is within what she may do anyway.
 * @param {string} publicId - Reported by the browser when the upload finished.
 *   An identifier and nothing more: the width, the height and the URL are read
 *   from the host under our own credentials, because a value from the client is
 *   not evidence about a file we are about to publish. See lib/image-host.js.
 *
 * Replaces the work's existing main image if it has one, and leaves the
 * previous file on the host — see `setMainImage`.
 */
export async function saveMainImage(workId, publicId) {
  if (!(await readAdminSession())) return { ok: false, error: 'notSignedIn' };

  const work = await getWorkById(workId);
  if (!work) return { ok: false, error: 'notFound' };

  const asset = await readUploadedImage(publicId);
  if (!asset.ok) return asset;

  let image;

  try {
    image = await setMainImageRecord(workId, asset.image);
  } catch (error) {
    console.error('[admin] saveMainImage failed', error);
    return { ok: false, error: 'unexpected' };
  }

  if (!image) return { ok: false, error: 'notFound' };

  // The painting has just appeared on the works list, the gallery, the homepage
  // grid and its own page. Without this she uploads, looks at the site, sees the
  // empty frame she was trying to fill, and reasonably concludes it did not work.
  revalidatePublicSite();

  return { ok: true, image };
}

/* ------------------------------------------------------------------ *
 * Site settings
 * ------------------------------------------------------------------ */

/**
 * Saves the site settings form.
 *
 * **Verifies the session itself**, like every mutation here — the page guard
 * has no say over a Server Action, which is a POST endpoint Next reaches
 * directly. See security.md.
 *
 * Takes no id: there is one settings row, and the repository addresses it by
 * the only key it can have. So there is nothing for the browser to repoint.
 *
 * **Every rule the database enforces is checked first**, in
 * `validateSettingsInput`, so a refusal comes back as a code the form turns
 * into Hebrew rather than as a constraint name. What that cannot know — whether
 * the English About text was approved — the form holds back by refusing to
 * submit, the same gate the work form uses.
 *
 * Ends back on the settings page with `?saved=1`, rather than on the works list
 * as a work save does. There is nowhere else a setting "appears" in the admin,
 * so the page itself, reloaded from the database, is the confirmation.
 */
export async function saveSettings(previousState, formData) {
  if (!(await readAdminSession())) {
    return { status: 'error', errors: { form: 'notSignedIn' } };
  }

  const submitted = Object.fromEntries(formData);
  const validated = validateSettingsInput(submitted);

  if (!validated.ok) {
    return { status: 'error', errors: validated.errors, values: submitted };
  }

  try {
    await updateSiteSettingsRecord(validated.value);
  } catch (error) {
    // Includes a missing row, whose message names migration 011 — for the log,
    // not for her.
    console.error('[admin] saveSettings failed', error);
    return { status: 'error', errors: { form: 'unexpected' }, values: submitted };
  }

  // The footer, the contact details and the About text are on every public
  // page, and the homepage is prerendered. One helper clears the whole tree.
  revalidatePublicSite();

  redirect('/admin/settings?saved=1');
}

/**
 * Signs one upload of the artist's portrait — into its own folder.
 *
 * The same signing as a painting's, with one difference that is the whole
 * point: the destination is `portrait`, fixed here in the action's own body.
 * The planned automation reads the paintings' folder as a queue of new works,
 * and a portrait landing there would become a draft painting. See
 * `UPLOAD_FOLDERS` in lib/image-host.js.
 *
 * Its own session check, like every action here.
 */
export async function signPortraitUpload() {
  if (!(await readAdminSession())) return { ok: false, error: 'notSignedIn' };

  return signImageUpload('portrait');
}

/**
 * Records a finished portrait upload, after asking the host what it is.
 *
 * **Only an asset in the portrait folder is accepted.** The id arrives from the
 * browser, and nothing else about it is believed — the dimensions and the URL
 * are read back from the host under our own credentials, exactly as for a
 * painting. The folder check closes the one thing that read-back does not: a
 * browser naming some *other* asset in her account, a painting's photograph
 * included, and having it recorded as her portrait.
 *
 * Takes no id to bind: there is one settings row. Saves the moment the upload
 * lands, as the work edit page's panel does, and clears the public site's
 * caches because the portrait is on the homepage and the About page.
 *
 * @param {string} publicId - As reported by the upload. An identifier only.
 */
export async function savePortrait(publicId) {
  if (!(await readAdminSession())) return { ok: false, error: 'notSignedIn' };

  if (typeof publicId !== 'string' || !publicId.startsWith(UPLOAD_FOLDERS.portrait + '/')) {
    return { ok: false, error: 'notFound' };
  }

  const asset = await readUploadedImage(publicId);
  if (!asset.ok) return asset;

  let saved;

  try {
    saved = await setPortraitRecord(asset.image);
  } catch (error) {
    console.error('[admin] savePortrait failed', error);
    return { ok: false, error: 'unexpected' };
  }

  revalidatePublicSite();

  return { ok: true, image: saved.portrait };
}

/* ------------------------------------------------------------------ *
 * Orders
 *
 * The four things the artist does to an order after it has been paid for. Every
 * one verifies the session in its own first line, because the page guard has no
 * say over a Server Action — see security.md — and every one takes its order id
 * as a **bound** argument rather than a form field. Bound is not tamper-proof
 * (see `updateWork`), which is harmless only because the session check comes
 * first and a signed-in admin may act on any order.
 *
 * None of them parses a form and none of them takes a date. The dates are set by
 * the same statement that moves the status, so what is recorded is when the
 * artist pressed the button rather than what she typed.
 * ------------------------------------------------------------------ */

function orderPath(orderId, outcome) {
  const path = '/admin/orders/' + encodeURIComponent(orderId);
  return outcome ? path + '?done=' + outcome : path;
}

/**
 * Moves an order one step forward: posted, or arrived.
 *
 * **The database decides whether the step is legal**, not this function and not
 * the page that drew the button. `advanceOrder` builds a `where` clause that can
 * only match an order actually in the state the step starts from, so a double
 * press, a stale tab, or a hand-made POST changes nothing instead of raising a
 * constraint violation at the artist.
 *
 * @param {string} orderId - Bound server-side by the page.
 * @param {'shipped'|'delivered'} to - Bound the same way, one per button.
 */
export async function advanceOrderStatus(orderId, to) {
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  const moved = await advanceOrderRecord({ orderId, to });

  redirect(orderPath(orderId, moved ? 'advanced-' + to : 'notAllowed'));
}

/**
 * Cancels an order, and gives the paintings back.
 *
 * Legal from `pending` — nothing was ever paid — and from `paid`, which is the
 * artist calling off a sale that had gone through. Both write `cancelled_at` in
 * the same statement.
 *
 * **The paintings this order holds come back as drafts**, not straight back onto
 * the site — and a pending order holds none: see `closeOrder`. That is why the public site is revalidated afterwards — a work
 * that has just become a draft must stop being served, and the gallery, the
 * homepage grid and its own artwork page would otherwise keep their cached
 * render and go on offering a painting that is no longer for sale.
 *
 * @param {string} orderId - Bound server-side by the page.
 */
export async function cancelOrder(orderId) {
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  const { ok, released } = await closeOrderRecord({ orderId, to: 'cancelled' });

  if (released > 0) revalidatePublicSite();

  // Which sentence follows depends on whether anything moved: a pending order,
  // or one whose painting has since sold again, releases nothing.
  redirect(orderPath(orderId, !ok ? 'notAllowed' : released > 0 ? 'cancelled' : 'cancelledNoneReleased'));
}

/**
 * Refunds an order, and gives the paintings back.
 *
 * Legal only from a status at or past paid, because 007 requires `paid_at`
 * before `refunded` — there is nothing to refund on an order nobody paid for,
 * and the `where` clause says so rather than trusting the page not to offer the
 * button.
 *
 * @param {string} orderId - Bound server-side by the page.
 */
export async function refundOrder(orderId) {
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  const { ok, released } = await closeOrderRecord({ orderId, to: 'refunded' });

  if (released > 0) revalidatePublicSite();

  redirect(orderPath(orderId, !ok ? 'notAllowed' : released > 0 ? 'refunded' : 'refundedNoneReleased'));
}

/**
 * Records that an owed refund has actually been paid back.
 *
 * **Its own action, and its own word, for a case that reads nothing like the one
 * above.** An order carrying `refund_due_at` is not a sale the artist changed her
 * mind about: it is a buyer who paid for a painting that had already gone to
 * somebody else, whose charge could not be voided automatically. The money is
 * hers to return, by hand, in the Hyp console — and this is her saying she has.
 *
 * It shares `closeOrder`'s write, because the resulting row is the same:
 * `refunded`, with `refunded_at`. What it does not share is the release —
 * `closeOrder` gives paintings back only for an order that actually held them,
 * and this one never did. **The painting on it belongs to whoever won the race**,
 * and taking it away from them would be the worst possible way to fix this.
 *
 * @param {string} orderId - Bound server-side by the page.
 */
export async function settleOwedRefund(orderId) {
  if (!(await readAdminSession())) redirect(ADMIN_LOGIN_PATH);

  const { ok } = await closeOrderRecord({ orderId, to: 'refunded' });

  redirect(orderPath(orderId, ok ? 'refundSettled' : 'notAllowed'));
}
