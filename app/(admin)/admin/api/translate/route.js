import { readAdminSession } from '@/lib/auth/admin-session';
import {
  translateToEnglish,
  MAX_TRANSLATION_CHARACTERS,
  TRANSLATION_KINDS,
} from '@/lib/translate';

/**
 * POST /admin/api/translate
 *
 * Hebrew in, English out, for the admin's work form. **The first route handler
 * on this project that is not a health check**, and it exists because nothing
 * cheaper will do: a server component cannot help — the browser needs an answer
 * mid-form, when a field is left — and the key may not leave the server.
 *
 * **It lives under `/admin`, and that is not cosmetic.** The session cookie is
 * scoped to that path, so the identical handler at `/api/admin/translate` would
 * receive no cookie and refuse every request from the artist while remaining
 * open to nobody. See security.md and api.md.
 *
 * **It verifies the session itself.** The page guard runs when a *page*
 * renders and has no say over route handlers, so without the check below this
 * is a free translation service for the internet, billed to us. It is also why
 * the check is the first statement rather than something the provider call
 * happens to sit behind.
 *
 * Cross-site abuse is covered separately by the cookie's `sameSite: lax`: a
 * POST from another origin arrives without the session and is refused here.
 *
 * Request:  `{ "text": "<hebrew>", "kind": "title" | "description" | "about" }`
 * Success:  `{ "ok": true, "text": "<english>" }`
 * Failure:  `{ "ok": false, "error": "<code>" }`
 *
 * `kind` is there because a painting title and a description are different
 * jobs — one comes back a noun phrase, the other prose — and the browser is the
 * only one that knows which field is asking. It is **a token from a closed set,
 * never a prompt**: the body stays two short strings, and validating it here
 * against the exported constant is what keeps this from becoming a way to hand
 * the model instructions of someone else's choosing.
 *
 * That `{ ok }` envelope is the shape api.md asks every route to share. The
 * error is a **code**, never a sentence — the browser turns it into Hebrew from
 * the locale files, exactly as the Server Actions do.
 */
export async function POST(request) {
  if (!(await readAdminSession())) {
    return fail('notSignedIn', 401);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return fail('malformed', 400);
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const kind = body?.kind;

  if (!text) return fail('empty', 400);
  if (text.length > MAX_TRANSLATION_CHARACTERS) return fail('tooLong', 413);
  if (!TRANSLATION_KINDS.includes(kind)) return fail('unknownKind', 400);

  const result = await translateToEnglish(text, kind);

  if (!result.ok) return fail(result.reason, statusFor(result.reason));

  return Response.json({ ok: true, text: result.text });
}

/**
 * The status that goes with a failure code.
 *
 * The form treats every one of them identically — no translation arrives,
 * nothing is waiting for approval, and she types the English herself — so these
 * are for whoever reads the network tab or a log, not for the browser's logic.
 */
function statusFor(reason) {
  // The per-minute ceiling, which is the one failure that fixes itself.
  if (reason === 'busy') return 429;

  // No key, or a key the provider will not accept: the service is not there to
  // be called, rather than having been called and answered badly.
  if (reason === 'notConfigured' || reason === 'rejected') return 503;

  return 502;
}

function fail(error, status) {
  return Response.json({ ok: false, error }, { status });
}
