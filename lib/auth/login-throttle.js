/**
 * Rate limiting on the admin sign-in form.
 *
 * scrypt makes each guess cost about a fifth of a second, which bounds someone
 * working through a stolen database. It does nothing at all about someone
 * posting to the login form in a loop, and that is what this is for. It is also
 * what makes the eight-character password minimum in `password.js` a reasonable
 * floor rather than a wide-open door — see .claude/rules/security.md.
 *
 * WHY POSTGRES AND NOT A MAP IN THIS MODULE
 *
 * A counter in memory is per-instance. Vercel runs many short-lived instances
 * and starts new ones freely, so an in-memory counter is shared by nobody,
 * survives nothing, and effectively resets at random. It would pass every test
 * on one laptop with one dev server and do close to nothing in production —
 * the worst kind of security control, the kind that reports success.
 *
 * So the counter is a row, and the cost is one small query on each sign-in
 * attempt. On a form used a few times a week by two people, that is free.
 *
 * WHAT IS COUNTED
 *
 * Two counters, and every attempt touches both:
 *
 *   - **the pair** — this address from this source. The tight limit. Keyed on
 *     both halves because address alone lets a stranger lock the artist out of
 *     her own account, and source alone is defeated by rotating addresses.
 *   - **the source** — this place, across every address it has tried. A looser
 *     ceiling, so working through a list from one machine is bounded too.
 *
 * The strictest applicable block wins.
 *
 * Attempts are counted against the address **as submitted**, whether or not an
 * account exists. Throttling only real accounts would make the site behave
 * differently for an address that exists, which is exactly the question the
 * error message and the decoy hash in `admin-users.js` refuse to answer.
 */
import { getPool } from '@/lib/db';

/* ------------------------------------------------------------------ *
 * Policy
 *
 * Ordinary constants, deliberately not in the migration: a policy you have to
 * write a migration to tune is a policy nobody tunes.
 * ------------------------------------------------------------------ */

/** Consecutive failures on one address+source before the first block. */
export const PAIR_THRESHOLD = 5;

/**
 * Failures from one source, across every address, before it is blocked.
 *
 * Looser than the pair limit on purpose. It is meant to bound someone working
 * through a list of addresses, not to catch a person mistyping their own
 * password, and a household or an office can share one address.
 */
export const SOURCE_THRESHOLD = 20;

/**
 * How long a block lasts, in minutes, as failures accumulate past the
 * threshold. The last entry is the ceiling: it escalates, and it stops.
 *
 * Not a permanent lock. The artist is one of the two people this can happen
 * to, there is no password reset flow, and a permanent lock on her own account
 * would be a phone call to her son at best. Fifteen minutes is long enough to
 * make automated guessing pointless and short enough to wait out.
 */
const BLOCK_LADDER_MINUTES = [1, 2, 5, 10, 15];

/**
 * How long a quiet counter is kept before pruning removes it.
 *
 * Longer than the longest block, so a row is never deleted while it is still
 * doing something.
 */
const STALE_AFTER_MINUTES = 60;

/**
 * The block length for a given number of consecutive failures, or null when
 * that count does not block yet.
 *
 * Exported and pure so the ladder can be reasoned about — and tested — without
 * a database.
 *
 * @param {number} failures
 * @param {number} threshold
 * @returns {number|null} Minutes to block for.
 */
export function blockMinutesFor(failures, threshold) {
  if (failures < threshold) return null;

  const step = failures - threshold;
  return BLOCK_LADDER_MINUTES[Math.min(step, BLOCK_LADDER_MINUTES.length - 1)];
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

/**
 * Normalises the address a counter is keyed on.
 *
 * Lowercased, for the same reason `admin_users` is unique on `lower(email)`:
 * otherwise five attempts at Orit@… and five at orit@… are ten free guesses.
 */
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Deletes counters that are finished — unblocked, and quiet for a while.
 *
 * **Where pruning happens, and why here.** There is no cron and no scheduled
 * job on this project, so it runs opportunistically: once per recorded failure,
 * in the same round trip. That means it happens exactly when the table is
 * growing and never when it is idle, which is the property a cleanup wants. On
 * a table this small it is a single index scan, and it is deliberately fired
 * on failures only — a successful sign-in should be the fastest path through
 * this module, not the one that pays for housekeeping.
 */
async function prune(client) {
  await client.query(
    `delete from admin_login_attempts
      where last_failure_at < now() - ($1 || ' minutes')::interval
        and (blocked_until is null or blocked_until < now())`,
    [String(STALE_AFTER_MINUTES)]
  );
}

/**
 * Whether this attempt is currently blocked.
 *
 * **Call this before verifying a password.** The point of a rate limit is to
 * stop the work being done, not to do it and throw the answer away — a check
 * that runs scrypt first and then declines to look at the result costs the
 * server exactly as much as no rate limit at all.
 *
 * @param {string} email - As submitted.
 * @param {string} ip
 * @returns {Promise<boolean>}
 */
export async function isLoginBlocked(email, ip) {
  const emailLower = normalizeEmail(email);

  // Both counters in one round trip. `blocked_until > now()` is evaluated by
  // the database rather than by comparing clocks here, so a machine whose time
  // has drifted cannot argue its way out of a block.
  const { rows } = await getPool().query(
    `select 1
       from admin_login_attempts
      where blocked_until > now()
        and (
          (email_lower = $1 and ip = $2)
          or (email_lower is null and ip = $2)
        )
      limit 1`,
    [emailLower, ip]
  );

  return rows.length > 0;
}

/**
 * Records one failed attempt against both counters.
 *
 * Upserts rather than reading and then writing: two attempts arriving together
 * would otherwise both read the same count and each write it back plus one,
 * losing a failure. `on conflict ... do update` makes the increment atomic, and
 * the ladder is applied from the freshly incremented value in the same
 * statement.
 *
 * @param {string} email - As submitted.
 * @param {string} ip
 */
export async function recordFailedLogin(email, ip) {
  const emailLower = normalizeEmail(email);
  const client = await getPool().connect();

  try {
    await client.query('begin');

    await bumpCounter(client, emailLower, ip, PAIR_THRESHOLD);
    await bumpCounter(client, null, ip, SOURCE_THRESHOLD);

    await prune(client);

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * One counter, incremented and then re-laddered.
 *
 * Two statements rather than one clever one. The increment is atomic — two
 * simultaneous attempts cannot both read the same count and each write it back
 * plus one — and it returns the new value, which the ladder is then applied to
 * in JavaScript. Expressing the ladder as array subscripting inside the upsert
 * worked but was unreadable, and it put the policy in two places: here and in
 * `blockMinutesFor`. One place is worth an extra round trip on a form used a
 * few times a week.
 *
 * Both statements run inside the caller's transaction, and the upsert leaves
 * the row locked until it commits, so nothing can slip between them.
 *
 * The `where` on each conflict target repeats the predicate of the partial
 * unique indexes from migration 006 — `on conflict` against a partial index has
 * to, or Postgres cannot tell which index is meant.
 */
async function bumpCounter(client, emailLower, ip, threshold) {
  const conflictTarget =
    emailLower === null
      ? '(ip) where email_lower is null'
      : '(email_lower, ip) where email_lower is not null';

  const { rows } = await client.query(
    `insert into admin_login_attempts (email_lower, ip, failures)
       values ($1, $2, 1)
     on conflict ${conflictTarget} do update
        set failures = admin_login_attempts.failures + 1,
            last_failure_at = now()
     returning id, failures`,
    [emailLower, ip]
  );

  const { id, failures } = rows[0];
  const minutes = blockMinutesFor(failures, threshold);

  if (minutes === null) return;

  // The ladder only ever lengthens, so this never shortens a block that is
  // already running.
  await client.query(
    `update admin_login_attempts
        set blocked_until = now() + ($2 || ' minutes')::interval
      where id = $1`,
    [id, String(minutes)]
  );
}

/**
 * Clears both counters after a successful sign-in.
 *
 * The pair goes, because the person proved they are who the address belongs to.
 * The source goes with it for the same reason: whoever is at that address has
 * just authenticated, and leaving their machine part-way up the ceiling would
 * lock the artist out for the rest of her own session.
 *
 * @param {string} email
 * @param {string} ip
 */
export async function clearFailedLogins(email, ip) {
  const emailLower = normalizeEmail(email);

  await getPool().query(
    `delete from admin_login_attempts
      where (email_lower = $1 and ip = $2)
         or (email_lower is null and ip = $2)`,
    [emailLower, ip]
  );
}
