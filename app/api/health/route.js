import { getAllWorks } from '@/lib/data/works-repository';

/**
 * GET /api/health
 *
 * A liveness check that also proves the data access layer is reachable from a
 * route handler, not just from pages. It calls the repository like everything
 * else does — it does not read the works file directly.
 */
export async function GET() {
  const works = await getAllWorks();

  return Response.json({
    status: 'ok',
    works: works.length,
    /* A reminder in the payload itself that none of the data is real yet. */
    dataIsPlaceholder: works.some((work) => work.hasPlaceholderData),
  });
}
