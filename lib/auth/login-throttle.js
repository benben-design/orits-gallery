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
 * A counter in memory is per-instance. Serverless hosting runs many
 * short-lived instances and starts new ones freely — Netlify here, and this
 * was equally true of Vercel before the host changed, because it is a property
 * of the model rather than of the company — so an in-memory counter is shared
 * by nobody, survives nothing, and effectively resets at random. It would pass every test
 * on one laptop with one dev server and do close to nothing in production —
 * the worst kind of security control, the kind that reports success.
 *
 * So the counter is a row, and the cost is one small query on each sign-in
 * attempt. On a form used a few times a week by two people, that is free.
 *
 * WHAT IS COUNTED
 *
 * Three counters, and every failed attempt touches all three:
 *
 *   - **the pair** — this address from this source. The tight limit. Keyed on
 *     both halves because address alone lets a stranger lock the artist out of
 *     her own account, and source alone is defeated by rotating addresses.
 *   - **the source** — this place, across every address it has tried. A looser
 *     ceiling, so working through a list from one machine is bounded too.
 *   - **the address** — this address, across every source (migration 012). The
 *     one that keeps counting when the source does not hold still: rotating
 *     sources, or forging `x-forwarded-for` off Netlify, makes every attempt a
 *     fresh pair and a fresh source, and without this nothing reached a
 *     threshold at all. 20 failures within 60 minutes block the address from
 *     everywhere for 15 minutes.
 *
 *     **That is a deliberate trade, recorded in security.md**: a stranger who
 *     knows the artist's address can keep her out fifteen minutes at a time.
 *     It is what the pair key was designed to avoid, and it is accepted,
 *     because the alternative is an unbounded guess rate against the account.
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
 * Failures on one address, from every source, within the window below, before
 * that address is blocked everywhere.
 *
 * As loose as the source ceiling: the artist mistyping her own password is five
 * attempts from one place, and never reaches this. What reaches it is guessing
 * spread across sources.
 */
export const ADDRESS_THRESHOLD = 20;

/**
 * The window the address ceiling counts within, in minutes. A counter whose
 * first failure is older than this starts again from one, so a trickle of
 * honest typos over a week never adds up to a block.
 */
export const ADDRESS_WINDOW_MINUTES = 60;

/**
 * How long the address ceiling blocks for, in minutes. Flat, not a ladder:
 * this is the block a stranger can impose on the artist, so it is held at the
 * pair ladder's ceiling and never climbs past it.
 */
export const ADDRESS_BLOCK_MINUTES = 15;

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

  // All three counters in one round trip. `blocked_until > now()` is evaluated
  // by the database rather than by comparing clocks here, so a machine whose
  // time has drifted cannot argue its way out of a block. The address counter
  // matches whatever `ip` is — that is the point of it: a blocked address is
  // blocked from a source it has never been seen from.
  const { rows } = await getPool().query(
    `select 1
       from admin_login_attempts
      where blocked_until > now()
        and (
          (email_lower = $1 and ip = $2)
          or (email_lower is null and ip = $2)
          or (email_lower = $1 and ip is null)
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
    await bumpAddressCounter(client, emailLower);

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
 * The address counter: one address, every source, in a window.
 *
 * Its own function rather than a third mode of `bumpCounter`, because it
 * behaves differently in both halves: the count restarts once the window has
 * passed, and the block is flat rather than laddered. Folding those into the
 * shared function would give it two policies behind one name.
 *
 * The window is applied inside the upsert, so it is as atomic as the
 * increment: a counter whose first failure is older than the window is reset
 * to one by the same statement that would otherwise have added one.
 *
 * The conflict target repeats migration 012's partial index predicate, for the
 * reason given on `bumpCounter`.
 */
async function bumpAddressCounter(client, emailLower) {
  const { rows } = await client.query(
    `insert into admin_login_attempts (email_lower, ip, failures)
       values ($1, null, 1)
     on conflict (email_lower) where ip is null do update
        set failures = case
              when admin_login_attempts.first_failure_at < now() - ($2 || ' minutes')::interval
                then 1
              else admin_login_attempts.failures + 1
            end,
            first_failure_at = case
              when admin_login_attempts.first_failure_at < now() - ($2 || ' minutes')::interval
                then now()
              else admin_login_attempts.first_failure_at
            end,
            last_failure_at = now()
     returning id, failures`,
    [emailLower, String(ADDRESS_WINDOW_MINUTES)]
  );

  const { id, failures } = rows[0];

  if (failures < ADDRESS_THRESHOLD) return;

  await client.query(
    `update admin_login_attempts
        set blocked_until = now() + ($2 || ' minutes')::interval
      where id = $1`,
    [id, String(ADDRESS_BLOCK_MINUTES)]
  );
}

/**
 * Clears all three counters after a successful sign-in: the pair, the source,
 * and the address across every source.
 *
 * The pair goes, because the person proved they are who the address belongs to.
 * The source goes with it for the same reason: whoever is at that address has
 * just authenticated, and leaving their machine part-way up the ceiling would
 * lock the artist out for the rest of her own session.
 *
 * **The address counter goes too.** Only the correct password reaches this
 * line, so clearing it gives an attacker nothing they did not already have —
 * whoever can clear it can sign in. What leaving it would cost is the artist:
 * after an attack has pushed her address to the ceiling, one typo of hers
 * inside the hour would block her again for fifteen minutes. A success from
 * any source clears it, because the counter belongs to the address, not to
 * where she signed in from.
 *
 * @param {string} email
 * @param {string} ip
 */
export async function clearFailedLogins(email, ip) {
  const emailLower = normalizeEmail(email);

  await getPool().query(
    `delete from admin_login_attempts
      where (email_lower = $1 and ip = $2)
         or (email_lower is null and ip = $2)
         or (email_lower = $1 and ip is null)`,
    [emailLower, ip]
  );
}
