/**
 * Creates an admin account, or sets the password on one that already exists.
 *
 * There are two accounts — the artist's and the developer's — with equal
 * rights, and this is the only way either of them comes into being. There is no
 * signup page, and there will not be one: a public route that creates an
 * administrator is a route someone else can find.
 *
 * Usage:
 *   npm run admin:create
 *   npm run admin:create -- orit@example.com
 *
 * The email may be given as an argument because it is not a secret. THE
 * PASSWORD MAY NOT. It is typed at the prompt, with the terminal echo off, and
 * it is never read from an argument, an environment variable, or a file:
 *
 *   - an argument is recorded in the shell history and visible in the process
 *     list to every other user on the machine, for as long as it runs;
 *   - an environment variable ends up in `.env.local`, which is a file nobody
 *     ever deletes, and in the crash logs of anything that dumps `process.env`;
 *   - a file is a password saved to disk in plaintext.
 *
 * For the same reason the script refuses to run without a terminal: without one
 * there is no way to type a password, and the only remaining ways to supply one
 * are the three above.
 *
 * There is no default password anywhere in this repository, and adding one
 * would be worse than any of the above — a documented default is a password
 * every reader of the git history already knows, and the account it protects
 * takes money.
 *
 * This script is deliberately NOT in database/migrations/: it is not part of
 * the schema, and a numbered file in that folder reads as something production
 * is expected to have run.
 */
import { createInterface } from 'node:readline/promises';
import { getPool } from '../lib/db.js';
import {
  hashPassword,
  verifyPassword,
  currentParameters,
  MIN_PASSWORD_LENGTH,
} from '../lib/auth/password.js';

/* ------------------------------------------------------------------ *
 * Terminal input
 *
 * Twenty lines rather than a prompts library, which is the house rule and also
 * the safer trade here: a password reader is a small enough thing to own
 * outright, and this one has no dependencies to audit.
 * ------------------------------------------------------------------ */

function fail(message) {
  console.error('\n' + message + '\n');
  process.exit(1);
}

/**
 * Reads a line with the echo off.
 *
 * Nothing is printed as it is typed — no asterisks, no cursor movement — which
 * is the same behaviour as `sudo` and means a shoulder or a screen recording
 * does not even learn the length.
 *
 * Raw mode is what makes that possible: it delivers each keystroke to this
 * process instead of letting the terminal draw it. It has to be turned off
 * again on every exit path, including Ctrl-C, or the shell is left unusable
 * afterwards.
 */
function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let value = '';

    const stop = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
    };

    /**
     * Keystrokes arrive as characters; these are the ones that are not text.
     * Compared by code point rather than written as escaped literals, because a
     * raw control byte in a source file is invisible in a diff and does not
     * survive an editor that trims it.
     */
    const ENTER_CR = 13;
    const ENTER_LF = 10;
    const CTRL_C = 3;
    const CTRL_D = 4;
    const BACKSPACE = 8;
    const DELETE = 127;
    const FIRST_PRINTABLE = 32;

    const onData = (chunk) => {
      for (const char of chunk) {
        const code = char.codePointAt(0);

        // Enter. On Windows this arrives as CR rather than LF.
        if (code === ENTER_CR || code === ENTER_LF) {
          stop();
          resolve(value);
          return;
        }

        // Ctrl-C and Ctrl-D both mean "stop", and neither should leave a
        // half-typed password behind in a variable.
        if (code === CTRL_C || code === CTRL_D) {
          stop();
          reject(new Error('Cancelled.'));
          return;
        }

        // Backspace, in both the forms terminals send it.
        if (code === BACKSPACE || code === DELETE) {
          value = value.slice(0, -1);
          continue;
        }

        // Printable characters only. Arrow keys and the like arrive as escape
        // sequences, and silently dropping them is better than letting an
        // invisible control character into a password that then cannot be
        // retyped.
        if (code >= FIRST_PRINTABLE) value += char;
      }
    };

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

/* ------------------------------------------------------------------ *
 * What we are about to write to
 *
 * Unlike scripts/seed-local-database.mjs, this one is NOT local-only. It writes
 * no placeholder data, and creating the real accounts against Neon is a thing
 * that has to happen for the site to launch. So instead of refusing a remote
 * host it names it and asks — the danger here is doing it to the wrong database
 * by accident, not doing it at all.
 * ------------------------------------------------------------------ */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function describeTarget() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    fail(
      'DATABASE_URL is not set, so there is no database to write to.\n' +
        'Copy .env.example to .env.local and fill in the connection string.'
    );
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    fail(
      'DATABASE_URL could not be parsed as a URL.\n' +
        'Expected postgresql://user:password@host:port/database'
    );
  }

  // Strip the brackets the URL parser puts around an IPv6 host, so that [::1]
  // matches the allowlist entry ::1.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  return {
    hostname,
    // Never the password, which is in this URL too.
    database: url.pathname.replace(/^\//, '') || '(default)',
    isLocal: LOCAL_HOSTNAMES.has(hostname),
  };
}

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

/**
 * Asks a question that is not secret, and closes the interface again.
 *
 * Opened and closed per question rather than held for the whole run, and that
 * is load-bearing rather than tidiness: a readline interface attached to a TTY
 * keeps its own listeners on stdin and echoes what it receives. Left open
 * across `readSecret`, it would print the password to the screen while
 * readSecret was carefully not printing it.
 */
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/**
 * Deliberately loose. The database has the real constraint — unique on the
 * lowercased address — and an over-clever pattern here only ever rejects
 * somebody's perfectly valid address.
 */
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function main() {
  if (!process.stdin.isTTY) {
    fail(
      'This script needs a terminal, because the password is typed at a prompt.\n' +
        'It cannot be piped in, and it must never be passed as an argument or\n' +
        'set in an environment variable. Run it directly:\n\n' +
        '  npm run admin:create'
    );
  }

  const target = describeTarget();

  console.log('\nAdmin account setup');
  console.log('  database: ' + target.database + ' on ' + target.hostname);

  try {
    if (!target.isLocal) {
      console.log(
        '\n  This is NOT a local database. You are about to create or change\n' +
          '  an account that can sign in to the live admin.'
      );
      const answer = await ask('\n  Type "yes" to continue: ');
      if (answer.trim() !== 'yes') fail('Stopped. Nothing was written.');
    }

    /* -------------------------------------------------------------- *
     * Email
     * -------------------------------------------------------------- */

    let email = process.argv[2]?.trim();

    if (!email) {
      email = (await ask('\n  Email address: ')).trim();
    }

    if (!email) fail('No email address given. Nothing was written.');

    if (!looksLikeEmail(email)) {
      fail('"' + email + '" does not look like an email address. Nothing was written.');
    }

    /* -------------------------------------------------------------- *
     * Does this account already exist?
     *
     * Matched on the lowercased address, which is what the unique index in
     * migration 004 is built on. Matching any other way both misses the index
     * and lets a second row exist for the same person.
     * -------------------------------------------------------------- */

    const pool = getPool();

    const existing = await pool.query(
      'select id, email from admin_users where lower(email) = lower($1)',
      [email]
    );

    const account = existing.rows[0] ?? null;

    if (account) {
      console.log('\n  This account already exists, stored as: ' + account.email);
      console.log('  Its password will be replaced.');

      // Worth showing, because email is matched case-insensitively and the
      // person typing may believe they are creating a second account.
      if (account.email !== email) {
        console.log('  (matched "' + email + '" ignoring capitalisation)');
      }
    } else {
      console.log('\n  This will create a new account.');
    }

    /* -------------------------------------------------------------- *
     * Password
     *
     * Asked for twice, because there is no password reset flow: a typo here
     * locks the account permanently, and the only fix is running this script
     * again — which the artist would need help to do.
     * -------------------------------------------------------------- */

    console.log(
      '\n  Choose a password. At least ' +
        MIN_PASSWORD_LENGTH +
        ' characters. Typing is hidden.'
    );

    const password = await readSecret('  Password: ');
    if (!password) fail('No password entered. Nothing was written.');

    const again = await readSecret('  Repeat it: ');

    if (password !== again) {
      fail('The two passwords did not match. Nothing was written.');
    }

    /* -------------------------------------------------------------- *
     * Write
     * -------------------------------------------------------------- */

    // Throws with a message meant to be read by whoever is choosing the
    // password if it is too short or too long.
    let passwordHash;
    try {
      passwordHash = await hashPassword(password);
    } catch (error) {
      fail(error.message + '\n\nNothing was written.');
    }

    const client = await pool.connect();

    try {
      await client.query('begin');

      if (account) {
        // updated_at is set here rather than by a trigger — the table has
        // none, deliberately — and a password change is the one event on this
        // row worth being able to date.
        await client.query(
          'update admin_users set password_hash = $1, updated_at = now() where id = $2',
          [passwordHash, account.id]
        );
      } else {
        // The address is stored exactly as typed. The unique index lowercases
        // for comparison; it does not need the stored value flattened, and
        // keeping the capitalisation means an email addressed to her looks
        // like the one she gave.
        await client.query(
          'insert into admin_users (email, password_hash) values ($1, $2)',
          [email, passwordHash]
        );
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    /* -------------------------------------------------------------- *
     * Read it back
     *
     * Cheap, and it proves the thing that actually matters: that what landed
     * in the column verifies against the password just typed. A hash written
     * wrongly is indistinguishable from a forgotten password later.
     * -------------------------------------------------------------- */

    const written = await pool.query(
      'select email, password_hash from admin_users where lower(email) = lower($1)',
      [email]
    );

    const ok = await verifyPassword(password, written.rows[0].password_hash);
    if (!ok) {
      fail(
        'The stored hash does not verify against the password just entered.\n' +
          'This is a bug. Do not rely on this account.'
      );
    }

    const total = await pool.query('select count(*)::int as count from admin_users');
    const parameters = currentParameters();

    console.log('\n  ' + (account ? 'Password updated' : 'Account created') + ' for ' + written.rows[0].email);
    console.log(
      '  Stored as ' +
        parameters.algorithm +
        ', N=' +
        parameters.N +
        ', r=' +
        parameters.r +
        ', p=' +
        parameters.p +
        ', and verified by reading it back.'
    );
    console.log('  Admin accounts now: ' + total.rows[0].count + '\n');
  } finally {
    await getPool().end();
  }
}

main().catch((error) => {
  // Cancelling at a prompt is a choice, not a crash.
  if (error.message === 'Cancelled.') {
    console.error('\nCancelled. Nothing was written.\n');
    process.exit(1);
  }

  console.error('\nFailed. Nothing was written.\n');
  console.error(error);
  process.exit(1);
});
