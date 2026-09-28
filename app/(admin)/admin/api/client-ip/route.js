import { readAdminSession } from '@/lib/auth/admin-session';

/**
 * TEMPORARY. Remove in the session after the merge that ships it — it is on
 * the launch checklist in deployment.md as a removal item.
 *
 * What the four client-address headers actually hold on the deployed site,
 * for the request that asks. `lib/auth/client-ip.js` prefers Netlify's own
 * `x-nf-client-connection-ip` and falls back to the left-most
 * `x-forwarded-for`, and neither choice has been measured on Netlify: whether
 * its edge replaces or appends to a client's `x-forwarded-for`, and whether it
 * strips a `x-nf-client-connection-ip` the client sent itself. Requesting this
 * once plainly, and once with both headers forged, answers both.
 *
 * **Signed in only, checked first**, like every admin route: the page guard
 * has no say over a route handler. Under `/admin` so the path-scoped session
 * cookie arrives. It returns the four values and nothing else — no other
 * header, no session detail — and nothing is logged, because the answer is
 * somebody's address.
 */
export async function GET(request) {
  if (!(await readAdminSession())) {
    return Response.json({ ok: false, error: 'notSignedIn' }, { status: 401, headers: NO_STORE });
  }

  const read = (name) => request.headers.get(name);

  return Response.json(
    {
      ok: true,
      'x-forwarded-for': read('x-forwarded-for'),
      'x-nf-client-connection-ip': read('x-nf-client-connection-ip'),
      'client-ip': read('client-ip'),
      'x-real-ip': read('x-real-ip'),
    },
    { headers: NO_STORE }
  );
}

/** An address is not something a cache should keep. */
const NO_STORE = { 'Cache-Control': 'no-store' };
