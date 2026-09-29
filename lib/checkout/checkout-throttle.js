/**
 * Rate limiting on checkout.
 *
 * `submitCheckout` is the only write on the site that needs no session. Every
 * submission that gets past validation writes a pending order, and once the Hyp
 * terminal is live every one of those also asks Hyp to sign a payment page. This
 * bounds how often one source can do that: `CHECKOUT_LIMIT` orders per
 * `CHECKOUT_WINDOW_MINUTES`, checked **before** anything is written or signed.
 *
 * **In Postgres, never in memory**, for the reason `lib/auth/login-throttle.js`
 * gives at length: serverless instances are many and short-lived, so a counter
 * in a module is shared by nobody and resets at random. It would pass every test
 * on a laptop and do nothing in production.
 *
 * WHAT IS COUNTED
 *
 * Orders created, not attempts. A slot is taken before the order is written,
 * and given back with `releaseCheckoutSlot` when no order was written after all —
 * a painting had gone, or the total had changed while the page was open. A
 * buyer told "the total changed" who presses again has made one order, not two.
 * A failure *after* the order exists — Hyp refusing to sign — keeps its slot,
 * because an order row was created and Hyp was asked, which is exactly the cost
 * being bounded.
 *
 * A form rejected for a typo never reaches this, because the check runs after
 * validation: validating writes nothing and signs nothing.
 *
 * PERSONAL DATA
 *
 * A client address is personal data. Every slot older than the window is
 * deleted on every checkout, for every source, and nothing else reads the
 * table. There is no scheduler on this project, so a row can outlast the window
 * until the next checkout by anybody — at this site's volume, by days. That is
 * recorded in security.md rather than hidden here.
 */
import { getPool } from '@/lib/db';

/* ------------------------------------------------------------------ *
 * Policy
 *
 * Constants rather than migration values, for the login throttle's reason: a
 * policy you have to write a migration to tune is a policy nobody tunes.
 * ------------------------------------------------------------------ */

/**
 * Orders one source may create within the window.
 *
 * A household buying two paintings and changing its mind once is three. Five
 * leaves room for honest use and stops a loop at the fifth.
 */
export const CHECKOUT_LIMIT = 5;

/** The sliding window the limit is counted over, in minutes. */
export const CHECKOUT_WINDOW_MINUTES = 60;

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

/**
 * Takes one order slot for this source, or refuses.
 *
 * One short transaction, in this order:
 *
 *   1. **A transaction-scoped advisory lock on the source.** Two submissions
 *      from one source arriving together would otherwise both count four and
 *      both insert, and the limit would be five only for polite callers. The
 *      lock serialises the count-and-insert per source and nothing else; other
 *      sources never wait on it. It is released by the commit.
 *   2. **Prune every source's expired slots.** Here, because this is the only
 *      moment the table is touched, and deleting is the only thing that keeps a
 *      client address from outliving its purpose.
 *   3. **Count this source's slots and insert one if there is room.**
 *
 * `hashtext` turns the address into the integer key `pg_advisory_xact_lock`
 * wants. Two addresses hashing alike share a lock and briefly queue behind each
 * other, which costs a few milliseconds and never a wrong answer — the count is
 * still per address.
 *
 * @param {string} ip - From `readClientIp`.
 * @returns {Promise<{ok: true, slotId: string} | {ok: false}>}
 */
export async function reserveCheckoutSlot(ip) {
  const client = await getPool().connect();

  try {
    await client.query('begin');

    await client.query('select pg_advisory_xact_lock(hashtext($1))', [ip]);

    await client.query(
      `delete from checkout_attempts
        where created_at < now() - ($1 || ' minutes')::interval`,
      [String(CHECKOUT_WINDOW_MINUTES)]
    );

    // After the prune, every remaining row for this source is inside the
    // window, so the count needs no time condition of its own.
    const { rows: counted } = await client.query(
      'select count(*)::int as used from checkout_attempts where ip = $1',
      [ip]
    );

    if (counted[0].used >= CHECKOUT_LIMIT) {
      await client.query('commit');
      return { ok: false };
    }

    const { rows: inserted } = await client.query(
      'insert into checkout_attempts (ip) values ($1) returning id',
      [ip]
    );

    await client.query('commit');
    return { ok: true, slotId: inserted[0].id };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gives a slot back, when the checkout it was taken for wrote no order.
 *
 * By id, so it can only ever return the slot this request took. If the row has
 * already been pruned there is nothing to give back, and deleting nothing is
 * the right outcome.
 *
 * @param {string} slotId
 */
export async function releaseCheckoutSlot(slotId) {
  await getPool().query('delete from checkout_attempts where id = $1', [slotId]);
}
