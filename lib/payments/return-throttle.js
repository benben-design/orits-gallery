import { getPool } from '@/lib/db';
import { UNKNOWN_CLIENT_IP } from '@/lib/auth/client-ip';

/**
 * The payment return's rate limit: how often one source may make us ask Hyp.
 *
 * Both return routes are public — Hyp sends the buyer's browser to them — and
 * every request that passes the query gate used to cost a database read and a
 * VERIFY call made with the terminal's own credentials. This bounds that per
 * source. Counted in Postgres and never in memory, for the sign-in throttle's
 * reason: serverless instances are many and short-lived, so a counter in memory
 * resets at random and reports success. Migration 014 is the table.
 *
 * **Set so that a genuine buyer is never refused.** A buyer comes back once, and
 * perhaps refreshes the confirmation page a few times; thirty in an hour is far
 * beyond that, and far below what makes a flood worth anything. Nothing gives a
 * return back, because one that verified still cost a VERIFY call.
 *
 * **A refused return may be a real payment**, so the caller logs it at full
 * volume and sends the buyer to their order page, which says the payment is
 * not confirmed yet. A refresh after the window verifies normally.
 *
 * **The unknown bucket is never limited.** On Netlify the source is always
 * known — `x-nf-client-connection-ip` was measured to be overwritten by the
 * edge — so an unattributable return means the header went missing, and then
 * every buyer would share one bucket of thirty. Refusing genuine payments is
 * the worse failure, so those returns go through, and say so in the log.
 */

export const RETURN_LIMIT = 30;
export const RETURN_WINDOW_MINUTES = 60;

/**
 * Counts one return for this source, if it is under the limit.
 *
 * One transaction under a per-source advisory lock, so two parallel returns
 * cannot both see room — the checkout throttle's shape. The lock key carries a
 * prefix so that it never collides with the checkout throttle's lock for the
 * same address. Rows past the window are deleted for every source first,
 * because they are client addresses and nothing else reads them.
 *
 * @param {string} ip - From `readClientIp`, never from the request's own headers.
 * @returns {Promise<{ok: boolean, unattributed?: boolean}>}
 */
export async function takeReturnSlot(ip) {
  if (ip === UNKNOWN_CLIENT_IP) return { ok: true, unattributed: true };

  const client = await getPool().connect();

  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', ['payment-return:' + ip]);

    await client.query(
      `delete from payment_return_attempts
        where created_at < now() - ($1 || ' minutes')::interval`,
      [String(RETURN_WINDOW_MINUTES)]
    );

    const { rows } = await client.query(
      'select count(*)::int as used from payment_return_attempts where ip = $1',
      [ip]
    );

    if (rows[0].used >= RETURN_LIMIT) {
      await client.query('commit');
      return { ok: false };
    }

    await client.query('insert into payment_return_attempts (ip) values ($1)', [ip]);
    await client.query('commit');

    return { ok: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
