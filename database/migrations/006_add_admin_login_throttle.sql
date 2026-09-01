-- 006_add_admin_login_throttle.sql
--
-- Adds admin_login_attempts: the counter behind rate limiting on the admin
-- sign-in form.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 007.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon.
-- Depends on admin_users existing only in spirit -- it references nothing, on
-- purpose, for the reason given below -- so its position in the order is not
-- load-bearing beyond coming after 004.
--
-- ASCII only, comments included. psql on Windows defaults its client encoding
-- to WIN1252 and a single character without a WIN1252 equivalent aborts the
-- statement it sits in. See .claude/rules/database.md.
--
--
-- WHY THIS TABLE EXISTS NOW
--
-- Migration 004 deliberately left out failed-attempt columns, and said why:
-- "Throttling is an application concern first; a column here only helps once
-- there is a policy to enforce." This file is that policy arriving. The shape
-- it takes is not the shape 004 imagined -- it is not columns on admin_users --
-- and the difference is the whole point:
--
--   * An attempt is counted against the address that was TYPED, whether or not
--     an account exists with it. Columns on admin_users could only ever count
--     attempts against real accounts, and that difference in behaviour would
--     answer the question the login's error message and the decoy hash in
--     lib/auth/admin-users.js are carefully refusing to answer: whether this
--     address has an account here.
--
--   * Therefore this table references nothing. There is no foreign key to
--     admin_users, and adding one later would break the property above.
--
--
-- WHAT IS COUNTED, AND WHY IT IS TWO THINGS
--
-- A row is one counter. Which counter it is depends on whether email_lower is
-- set:
--
--   * email_lower NOT NULL -- one address being tried from one place. This is
--     the tight limit, and it is keyed on the pair rather than on either half:
--
--       - address alone would let any stranger lock the artist out of her own
--         account by hammering her address from anywhere;
--       - source alone is defeated by rotating through addresses.
--
--   * email_lower NULL -- one place, across every address it has tried. The
--     looser ceiling, so that working through a list of addresses from a single
--     source is bounded too.
--
-- Both are checked before a password is verified, and the strictest one wins.
--
--
-- WHAT IS NOT HERE
--
-- No thresholds, no delays, no ladder. Those live in lib/auth/login-throttle.js
-- as ordinary constants, because a policy tuned by editing a migration is a
-- policy nobody tunes. This table stores only the count, when it last moved,
-- and until when the pair is blocked.

create table admin_login_attempts (
  id uuid primary key default gen_random_uuid(),

  -- The address as submitted, lowercased. NULL means this row counts a source
  -- across all addresses -- see the two kinds of counter above.
  --
  -- Deliberately not validated as an email: it records what somebody typed,
  -- including nonsense, because nonsense typed repeatedly is exactly what this
  -- table is here to slow down.
  email_lower text,

  -- The client address, as text rather than inet: it arrives from a proxy
  -- header, it can be IPv4 or IPv6, and a value that fails to parse must still
  -- be countable rather than raising mid-login. See lib/auth/client-ip.js.
  ip text not null,

  -- Consecutive failures. Reset to zero by a successful sign-in, never
  -- decremented gradually -- an attacker should not be able to wait out half a
  -- ladder and keep the rest of their allowance.
  failures integer not null default 0 check (failures >= 0),

  -- When the block lifts, or NULL when the counter is not blocking yet.
  -- Absolute, so the ladder is readable straight out of the row.
  blocked_until timestamptz,

  first_failure_at timestamptz not null default now(),

  -- What pruning reads. A row whose last failure is old and whose block has
  -- lapsed is finished, and the application deletes it.
  last_failure_at timestamptz not null default now()
);

-- Two partial indexes rather than one over (email_lower, ip).
--
-- In a plain unique index NULLs are distinct from each other, so every
-- source-wide row for one IP would be allowed to exist many times over and the
-- looser ceiling would silently never accumulate. Splitting on the NULL makes
-- each kind of counter unique in its own terms, and both indexes are what the
-- upserts in lib/auth/login-throttle.js conflict against.
create unique index admin_login_attempts_pair
  on admin_login_attempts (email_lower, ip)
  where email_lower is not null;

create unique index admin_login_attempts_source
  on admin_login_attempts (ip)
  where email_lower is null;

-- Pruning scans this. Rows are deleted once they are both unblocked and stale,
-- which for a two-account admin means the table stays close to empty.
create index admin_login_attempts_stale
  on admin_login_attempts (last_failure_at);
