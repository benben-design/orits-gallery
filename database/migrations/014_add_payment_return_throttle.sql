-- 014_add_payment_return_throttle.sql
--
-- Adds payment_return_attempts: the counter behind rate limiting on the two
-- payment return routes, /api/payments/hyp/return and /api/payments/hyp/error.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 015.
--
-- Run by hand, after 013_add_checkout_throttle.sql, against the local
-- database and against Neon. It references no other table, so its position
-- in the order is not load-bearing.
--
-- ASCII only, comments included. See .claude/rules/database.md.
--
--
-- WHY THIS TABLE EXISTS
--
-- The return routes are public: Hyp sends the buyer's browser to them, so no
-- session can be asked for. Every request that passes the query gate used to
-- cost a database read and a VERIFY call to Hyp made with our terminal's
-- credentials - for anybody, as often as they liked. Hyp's policy on a flood
-- of failed VERIFY calls against one terminal is unknown, and finding out on
-- the day of a sale is the wrong way to learn it. This bounds how often one
-- source can make us ask.
--
-- Its own table rather than more rows in checkout_attempts, for 013's reason:
-- the two limits count different things, answer to different code, and are
-- tuned separately.
--
--
-- WHAT A ROW IS
--
-- One return that a source made, counted before the order is read or VERIFY
-- is asked. Not a counter: a row per return, so "how many in the last hour" is
-- a count over a sliding window. Nothing gives a row back - a return that
-- verifies still cost a VERIFY call - so the limit is set far above what a
-- buyer returning once and refreshing their confirmation page could reach.
--
--
-- PERSONAL DATA
--
-- ip is a client address, which is personal data. Rows older than the window
-- are deleted by the application on every return, for every source, and are
-- never kept for any other purpose. There is no scheduler on this project, so
-- a row can outlast the window until the next return by anybody. See
-- .claude/rules/security.md.
--
--
-- WHAT IS NOT HERE
--
-- No limit and no window. Both are constants in
-- lib/payments/return-throttle.js, for 006's reason: a policy you have to
-- write a migration to tune is a policy nobody tunes.
--
--
-- APPLY BEFORE THE CODE
--
-- The code that writes this table ships in the same change. Like 012 and 013
-- it does not fail the build - nothing prerendered touches it - so a database
-- without it fails at runtime, on the first payment return: every buyer
-- coming back from Hyp would be sent to their order page unverified, with the
-- failure logged. Apply it to both databases first.


create table payment_return_attempts (
  id uuid primary key default gen_random_uuid(),

  -- The client address, as text rather than inet, for 006's reason: it arrives
  -- from a proxy header and a value that fails to parse must still be
  -- countable. See lib/auth/client-ip.js. The application truncates it to 64
  -- characters; the check is the database's half of that.
  ip text not null check (length(ip) between 1 and 64),

  -- When the return arrived. What the window is counted over and what pruning
  -- deletes by.
  created_at timestamptz not null default now()
);

-- The count for one source within the window reads this. Pruning, which is
-- across every source, scans the table instead; it holds little more than one
-- window's worth of returns, so no second index is worth keeping.
create index payment_return_attempts_ip_created
  on payment_return_attempts (ip, created_at);
