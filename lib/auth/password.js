/**
 * Password hashing for the admin accounts.
 *
 * scrypt, from Node's built-in crypto. No dependency: bcrypt and argon2 are
 * native modules with a compile step, and this project has two accounts and a
 * house rule that prefers a platform feature over a package. scrypt is a
 * memory-hard KDF designed for exactly this, and it has been in core since
 * Node 10.
 *
 * WHAT IS STORED
 *
 *   $scrypt$N=65536,r=8,p=1$<salt base64>$<key base64>
 *
 * Self-describing, in the same spirit as bcrypt's $2b$12$... and argon2's
 * $argon2id$v=19$... — the algorithm, its cost parameters and the salt all
 * travel inside the value. Two consequences, and both are the point:
 *
 *   1. Verification reads the parameters out of the stored value rather than
 *      assuming today's constants, so raising the cost later does not
 *      invalidate a single existing password. Old rows keep verifying at the
 *      cost they were written with, and `needsRehash` says which ones are
 *      behind.
 *   2. The column needs no migration to hold a different algorithm one day.
 *      `password_hash` is unbounded text precisely so that this stays true —
 *      see database/migrations/004_create_admin_users_table.sql.
 *
 * WHAT IS NOT STORED: the password. There is no plaintext column, no reversible
 * encryption, and no way to recover a password from this value. Hashing happens
 * here, in the application, and never in SQL — a password passed to a database
 * function is a password sitting in the query log. See .claude/rules/security.md.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/* ------------------------------------------------------------------ *
 * Cost
 *
 * Raising these is safe, and needs no migration and no password reset: new
 * hashes are written at the new cost, old ones keep verifying at the cost
 * recorded inside them, and `needsRehash` reports the difference so a login
 * can upgrade a password at the one moment it has the plaintext.
 * ------------------------------------------------------------------ */

/**
 * CPU and memory cost. Must be a power of two.
 *
 * 2^16 with r=8 means 128 * N * r = 64 MiB of memory per hash, and roughly a
 * fifth of a second of work. Deliberately slow: the whole value of a
 * memory-hard KDF is that someone holding a stolen database cannot try many
 * candidates cheaply. It stays comfortable for a login that happens a few
 * times a week and never on a page a visitor loads.
 */
const N = 65536;

/** Block size. 8 is the standard value, and what the memory figure above assumes. */
const R = 8;

/** Parallelisation. 1 is standard for this use. */
const P = 1;

/** Derived key length, in bytes. */
const KEY_LENGTH = 64;

/** Salt length, in bytes. Unique per password, stored beside the key. */
const SALT_LENGTH = 16;

/**
 * Node's scrypt refuses to allocate more than `maxmem`, which defaults to
 * 32 MiB — less than the 64 MiB this cost needs, so it has to be passed
 * explicitly or every hash throws. Derived from the parameters rather than
 * hardcoded, so that changing N or R above cannot leave a stale ceiling behind.
 */
function maxmemFor(n, r) {
  return 128 * n * r * 2;
}

/**
 * The most memory any stored value may ask us to allocate: 512 MiB.
 *
 * Verification takes its parameters from the stored string. That string comes
 * from our own database, but a corrupted or tampered row should fail to verify
 * rather than ask the process for an unbounded allocation and take the server
 * down with it.
 */
const MAX_MEMORY_BYTES = 512 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Policy
 * ------------------------------------------------------------------ */

/**
 * The floor is length rather than a composition rule, which mostly pushes
 * people towards Passw0rd!.
 *
 * Eight, chosen deliberately over the twelve this started at: the admin is used
 * by two people, one of whom is not technical, and a minimum she finds annoying
 * gets written on a note beside the screen — which is a worse outcome than four
 * fewer characters. Raising it later is a one-line change and costs nobody
 * their password, because the stored value carries its own parameters.
 *
 * Two things make eight acceptable, and neither is the length itself:
 *
 *   - **scrypt's cost.** A guess takes about a fifth of a second, so someone
 *     holding a stolen database gets a few per second rather than billions.
 *   - **The rate limit on the login form**, in `lib/auth/login-throttle.js`.
 *     scrypt does nothing about someone posting to the form in a loop; five
 *     wrong guesses and the form stops answering.
 *
 * **Those two and this number are a set.** Lowering this further, or removing
 * the throttle, means revisiting the other. See .claude/rules/security.md.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * An upper bound, so that hashing cannot be turned into a denial of service by
 * submitting a megabyte. Far above anything a person types — and unlike bcrypt,
 * scrypt does not silently ignore everything past 72 bytes.
 */
export const MAX_PASSWORD_LENGTH = 1024;

/**
 * Unicode normalisation, applied identically when hashing and when verifying.
 *
 * The same password typed on a phone and on a laptop can arrive as different
 * byte sequences: a Hebrew letter carrying a nikud mark, or an accented Latin
 * character, may be one composed code point or two combining ones. Without
 * this, a password that looks identical on screen fails to verify, and the
 * artist cannot tell that apart from having forgotten it. NFC is the form
 * RFC 8265 specifies for passwords.
 */
function normalize(password) {
  return password.normalize('NFC');
}

/* ------------------------------------------------------------------ *
 * Encoding
 * ------------------------------------------------------------------ */

const ALGORITHM = 'scrypt';

function encode({ n, r, p, salt, key }) {
  return [
    '',
    ALGORITHM,
    'N=' + n + ',r=' + r + ',p=' + p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Parses a stored value, or returns null if it is not one.
 *
 * Every failure returns null rather than throwing. A row that does not parse is
 * a row whose password cannot be verified, which is a failed login and not a
 * crashed request — and the difference matters, because this sits on the path
 * where someone else chooses the input.
 */
function decode(stored) {
  if (typeof stored !== 'string') return null;

  const parts = stored.split('$');
  if (parts.length !== 5) return null;

  const [empty, algorithm, parameters, saltBase64, keyBase64] = parts;
  if (empty !== '' || algorithm !== ALGORITHM) return null;

  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parameters);
  if (!match) return null;

  const n = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);

  // scrypt itself requires N to be a power of two greater than one. The rest
  // guards against a value that would ask for an absurd allocation.
  if (n < 2 || (n & (n - 1)) !== 0) return null;
  if (r < 1 || p < 1) return null;
  if (128 * n * r > MAX_MEMORY_BYTES) return null;

  const salt = Buffer.from(saltBase64, 'base64');
  const key = Buffer.from(keyBase64, 'base64');
  if (salt.length === 0 || key.length === 0) return null;

  return { n, r, p, salt, key };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Hashes a password for storage in `admin_users.password_hash`.
 *
 * @param {string} password - The plaintext, as typed.
 * @returns {Promise<string>} The self-describing value to store.
 * @throws {Error} If the password fails the length policy. The message is
 *   written to be shown to whoever is choosing the password.
 */
export async function hashPassword(password) {
  if (typeof password !== 'string') {
    throw new TypeError('A password must be a string.');
  }

  const normalized = normalize(password);

  if (normalized.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      'A password must be at least ' +
        MIN_PASSWORD_LENGTH +
        ' characters. This one is ' +
        normalized.length +
        '.'
    );
  }

  if (normalized.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      'A password must be at most ' + MAX_PASSWORD_LENGTH + ' characters.'
    );
  }

  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(normalized, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: maxmemFor(N, R),
  });

  return encode({ n: N, r: R, p: P, salt, key });
}

/**
 * Checks a password against a stored value.
 *
 * The comparison is constant time. `timingSafeEqual` takes the same time
 * whether the first byte differs or only the last, so how long a failed
 * attempt took says nothing about how close the guess was. A plain `===`
 * leaks exactly that, one byte at a time.
 *
 * Returns false rather than throwing for anything malformed — an unparseable
 * stored value, a wrong length, a password that is not a string. The caller
 * wants a yes or no on the login path, not an exception to handle.
 *
 * @param {string} password - The plaintext, as typed.
 * @param {string} stored - The value from `admin_users.password_hash`.
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string') return false;

  const parsed = decode(stored);
  if (!parsed) return false;

  const normalized = normalize(password);

  // Bound the work before doing any. An over-long candidate cannot be correct,
  // because hashPassword would have refused to store it.
  if (normalized.length > MAX_PASSWORD_LENGTH) return false;

  const { n, r, p, salt, key } = parsed;

  let candidate;
  try {
    candidate = await scryptAsync(normalized, salt, key.length, {
      N: n,
      r,
      p,
      maxmem: maxmemFor(n, r),
    });
  } catch {
    // Parameters that parsed but that scrypt still refuses. Not verifiable,
    // so not a match.
    return false;
  }

  // timingSafeEqual throws on a length mismatch. The length here comes from
  // the stored value rather than from the candidate password, so it is not
  // secret, and checking it first simply keeps the call from throwing.
  if (candidate.length !== key.length) return false;

  return timingSafeEqual(candidate, key);
}

/**
 * Whether a stored value was written at a lower cost than the current one.
 *
 * This is the half of "raise the cost later" that the format alone does not
 * give you. When the login flow exists it should call this after a successful
 * verification — the one moment the plaintext is in hand — and write a fresh
 * hash if it returns true. Until then nothing calls it, and raising the cost
 * above only affects newly written passwords.
 *
 * Also returns true for a value that does not parse at all, since anything
 * unreadable is certainly not current.
 *
 * @param {string} stored
 * @returns {boolean}
 */
export function needsRehash(stored) {
  const parsed = decode(stored);
  if (!parsed) return true;

  return (
    parsed.n < N ||
    parsed.r < R ||
    parsed.p < P ||
    parsed.key.length < KEY_LENGTH
  );
}

/**
 * The current cost, for a script or a log line that wants to report it.
 *
 * @returns {{algorithm: string, N: number, r: number, p: number, keyLength: number, saltLength: number}}
 */
export function currentParameters() {
  return {
    algorithm: ALGORITHM,
    N,
    r: R,
    p: P,
    keyLength: KEY_LENGTH,
    saltLength: SALT_LENGTH,
  };
}
