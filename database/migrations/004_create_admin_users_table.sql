-- 004_create_admin_users_table.sql
--
-- Creates admin_users: the accounts that can sign in to /admin.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 005.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon.
-- Depends on nothing, so its position in the order is not load-bearing.
--
-- Plural, and nothing in this table assumes one row: there are two accounts,
-- the artist's and the developer's. Note that .claude/rules/database.md and
-- security.md both still describe a single account for the artist — this
-- migration supersedes them, and they need correcting.
--
-- Both accounts carry the same powers. There is no role column, because there
-- is no second kind of admin yet and a role that only ever holds one value is
-- a column that teaches a future reader something untrue.

create table admin_users (
  id uuid primary key default gen_random_uuid(),

  -- The login identity. Stored as given; matched case-insensitively by the
  -- index below, which is what "unique" has to mean for an email address.
  --
  -- Case matters here more than it looks. The artist is not technical, she may
  -- type Orit@... on a phone that capitalises the first letter for her, and a
  -- login that silently fails on capitalisation is indistinguishable from a
  -- forgotten password. It is also how two rows for one person get created.
  email text not null,

  -- The hash, and only ever the hash.
  --
  -- There is deliberately NO plaintext password column, and adding one later
  -- is not a shortcut worth taking under any deadline: it turns one stolen
  -- database backup into every password this person uses elsewhere.
  --
  -- Sized as unbounded text on purpose. A modern hash is a self-describing
  -- modular crypt string that carries its algorithm, cost and salt inside the
  -- value — $2b$12$... for bcrypt, $argon2id$v=19$... for argon2 — so the
  -- algorithm can be upgraded, or the cost raised as hardware gets faster,
  -- with no migration. A char(60) column sized to today's bcrypt would need
  -- one, and would truncate silently in the meantime.
  --
  -- Hashing happens in the application, never in SQL: a password passed to a
  -- database function is a password in the query log.
  password_hash text not null,

  created_at timestamptz not null default now(),

  -- No trigger. The application sets this on every write — notably on a
  -- password change, which is the one event here worth being able to date.
  updated_at timestamptz not null default now()
);

-- Unique on the lowercased address rather than on the column, so that
-- orit@example.com and Orit@Example.com cannot both exist and either one can
-- sign in. Queries must match the same way — where lower(email) = lower($1) —
-- or they will not use this index.
create unique index admin_users_email_idx on admin_users (lower(email));

-- Deliberately absent, and each of these is a later migration when the
-- mechanism it belongs to is actually designed:
--
--   * password reset — a single-use token, its hash rather than the token
--     itself, and an expiry. Not designed yet, and guessing at the columns
--     now would fix the shape of a flow nobody has thought through.
--   * a last-login timestamp, and failed-attempt counting for rate limiting.
--     Throttling is an application concern first; a column here only helps
--     once there is a policy to enforce.
--
-- Listed rather than left silent so that their absence reads as a decision
-- and not as an oversight.
