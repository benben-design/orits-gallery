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
import { revalidatePath } from 'next/cache';
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
  getWorkById,
  DuplicateSlugError,
  WorkHasOrdersError,
} from '@/lib/data/works-repository';
import { validateWorkInput, workToFormValues } from '@/lib/data/work-input';
import { safeReturnTo, ADMIN_LOGIN_PATH } from '@/lib/auth/admin-guard';
import { readClientIp } from '@/lib/auth/client-ip';
import {
  isLoginBlocked,
  recordFailedLogin,
  clearFailedLogins,
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

  // Checked BEFORE the password is verified, and that ordering is the whole
  // point: a limit that runs scrypt and then declines to look at the answer
  // costs the server exactly as much as having no limit at all. A blocked
  // attempt does no hashing and touches no account.
  if (await isLoginBlocked(email, ip)) return BLOCKED;

  const account = await authenticateAdmin(email, password);

  // One failure, one answer. Whether the address is unknown or the password is
  // wrong, this returns the same thing and took about as long to do it — see
  // the decoy hash in lib/auth/admin-users.js. Nothing about the attempt is
  // written to the log either: a log line saying which email was tried is a
  // list of admin addresses sitting in a log.
  //
  // The failure is counted against the address as submitted, whether or not it
  // belongs to an account. Counting only real accounts would make the site
  // behave differently for an address that exists, which is the one thing all
  // of this is arranged to avoid saying.
  if (!account) {
    await recordFailedLogin(email, ip);
    return FAILED;
  }

  // Proving the password clears both counters, so a person who mistyped four
  // times and then got it right starts from zero rather than one attempt away
  // from locking themselves out.
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

  let created;

  try {
    created = await createWorkRecord(validated.value);
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
  revalidatePath('/', 'layout');

  return {
    status: 'created',
    published: Boolean(created.publishedAt),
    workId: created.id,
  };
}

/**
 * Saves changes to an existing painting.
 *
 * The work's id is a **bound argument**, not a form field. Next signs bound
 * arguments, so the browser cannot swap in a different id — where a hidden
 * input could be edited into "save my changes over that other work".
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
  revalidatePath('/', 'layout');

  return {
    status: 'saved',
    published: Boolean(saved.publishedAt),
    // Echo the saved values back, so the form redraws from what was actually
    // stored rather than from what was typed — normalised slugs included.
    values: workToFormValues(saved),
  };
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
 * @param {string} workId - Bound server-side, so the browser cannot swap it.
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
  revalidatePath('/', 'layout');

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

  revalidatePath('/', 'layout');

  // Back to the list, where it now reads as a draft. That is the confirmation:
  // she can see the state she asked for rather than being told about it.
  redirect('/admin');
}
