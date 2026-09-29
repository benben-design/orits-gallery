-- 013_add_checkout_throttle.sql
--
-- Adds checkout_attempts: the counter behind rate limiting on checkout.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 014.
--
-- Run by hand, after 012_add_login_address_ceiling.sql, against the local
-- database and against Neon. It references no other table, so its position
-- in the order is not load-bearing.
--
-- ASCII only, comments included. See .claude/rules/database.md.
--
--
-- WHY THIS TABLE EXISTS
--
-- submitCheckout is the only write on the site that needs no session. Every
-- call that gets past validation writes a pending order, and once the Hyp
-- terminal is live every one of those also asks Hyp to sign a payment page.
-- Nothing bounded how often one source could do that. This does: at most a
-- handful of orders per source per window, checked before anything is written
-- or signed.
--
-- Its own table rather than more rows in admin_login_attempts. The two limits
-- count different things, prune on different schedules and answer to
-- different code, and a shared table would tie a checkout change to the admin
-- sign-in and the other way round.
--
--
-- WHAT A ROW IS
--
-- One order slot used by one source. Not a counter: a row per slot, so that
-- "how many in the last hour" is a count over a sliding window rather than a
-- fixed bucket that resets on the hour and lets a burst straddle it.
--
-- A slot is taken before the order is written and given back if no order was
-- written after all (a painting had gone, the total had changed), so the rows
-- for a source are the orders it actually created, plus any in flight.
--
--
-- PERSONAL DATA
--
-- ip is a client address, which is personal data. Rows older than the window
-- are deleted by the application on every checkout, for every source, and are
-- never kept for any other purpose. There is no scheduler on this project, so
-- at this site's volume a row can outlast the window by days, until the next
-- checkout by anybody. See .claude/rules/security.md.
--
--
-- WHAT IS NOT HERE
--
-- No limit and no window. Both are constants in lib/checkout/checkout-throttle.js,
-- for 006's reason: a policy you have to write a migration to tune is a policy
-- nobody tunes.


create table checkout_attempts (
  id uuid primary key default gen_random_uuid(),

  -- The client address, as text rather than inet, for 006's reason: it arrives
  -- from a proxy header and a value that fails to parse must still be
  -- countable. See lib/auth/client-ip.js. The application truncates it to 64
  -- characters; the check is the database's half of that.
  ip text not null check (length(ip) between 1 and 64),

  -- When the slot was taken. What the window is counted over and what pruning
  -- deletes by.
  created_at timestamptz not null default now()
);

-- The count for one source within the window reads this. Pruning, which is
-- across every source, scans the table instead; it holds little more than one
-- window's worth of checkouts, so no second index is worth keeping.
create index checkout_attempts_ip_created
  on checkout_attempts (ip, created_at);
