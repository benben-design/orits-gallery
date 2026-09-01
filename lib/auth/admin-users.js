/**
 * Checking an email and password against the admin accounts.
 *
 * The only module that reads `admin_users` for a sign-in. It answers one
 * question — is this pair correct — and returns the account it belongs to or
 * nothing at all. It never reports *why* a sign-in failed, because the caller
 * must not be able to either.
 */
import { getPool } from '@/lib/db';
import { verifyPassword } from './password';

/**
 * A real scrypt hash, at the current parameters, of a random string that was
 * never written down.
 *
 * This is what an unknown email is checked against, so that the work done is
 * the same whether or not an account exists. Without it, "no such account"
 * returns in about a millisecond while a wrong password takes about a fifth of
 * a second, and that difference answers the question the error message is
 * carefully refusing to answer: whether this address has an account here.
 *
 * Safe to keep in the repository. It is a hash, not a secret, and nothing can
 * verify against it — the password it was made from is gone.
 *
 * If the cost parameters in `password.js` change, regenerate this so the two
 * paths keep taking the same time. `needsRehash(ABSENT_ACCOUNT_HASH)` returning
 * true is the signal that it has drifted.
 */
const ABSENT_ACCOUNT_HASH =
  '$scrypt$N=65536,r=8,p=1$FenCadjZ21QYYRh9JdJcTQ==$28+ES1rnQB05dgqgM7SosxW+2LJJx1MkUnvq5++QFgDQSUSf9QnS5a92/U5c58H6AKu4zlAVt7cjF6MkZjR5MA==';

/**
 * Verifies an email and password against the admin accounts.
 *
 * Matched on the lowercased address, which is what the unique index in
 * migration 004 is built on. Matching any other way both misses the index and
 * makes a sign-in fail on capitalisation — which, to the person typing, is
 * indistinguishable from having forgotten the password.
 *
 * The two failures are deliberately made to look alike from the outside:
 *
 *   - the same return value, so the caller has nothing to branch on and cannot
 *     accidentally render two different messages;
 *   - the same work, because both paths run exactly one scrypt verification at
 *     the same cost.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{id: string, email: string}|null>} The account, or null.
 */
export async function authenticateAdmin(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') return null;

  const { rows } = await getPool().query(
    'select id::text as id, email, password_hash from admin_users where lower(email) = lower($1)',
    [email.trim()]
  );

  const account = rows[0] ?? null;

  // Note what this does NOT do: return early when there is no account. The
  // verification below runs either way, against the real hash or the decoy.
  const correct = await verifyPassword(
    password,
    account ? account.password_hash : ABSENT_ACCOUNT_HASH
  );

  if (!account || !correct) return null;

  return { id: account.id, email: account.email };
}
