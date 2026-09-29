/**
 * GET /api/health
 *
 * Liveness only: the function is deployed and answers. **It touches no
 * database**, deliberately — a public route that queries Postgres on every
 * request is a way for anybody to wake the production database and spend its
 * compute, and nothing monitors this route that needs more than a 200.
 *
 * Whether the database is reachable is answered by any page that reads a
 * painting, which fails loudly when it is not.
 */
export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
