-- 012_add_login_address_ceiling.sql
--
-- Lets admin_login_attempts hold a third kind of counter: one address, across
-- EVERY source. 006 counted an address only together with the source it came
-- from, so an attacker rotating sources - or, off Netlify, forging
-- x-forwarded-for - got a fresh pair on every attempt and nothing per-address
-- ever reached a threshold. The comment in lib/auth/client-ip.js that said
-- otherwise was wrong, and this is the counter it assumed existed.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 013.
--
-- Run by hand, after 011_create_site_settings_table.sql, against the local
-- database and against Neon.
--
-- ASCII only, comments included. See .claude/rules/database.md.
--
--
-- THE THREE KINDS OF ROW, AFTER THIS
--
--   email_lower set,  ip set   the pair: this address from this source (006)
--   email_lower null, ip set   the source, across every address (006)
--   email_lower set,  ip null  the address, across every source (NEW)
--
-- A null ip is how "every source" is said, the same way 006 already says
-- "every address" with a null email_lower. Both null would be a counter of
-- nothing, and is refused.
--
-- No thresholds, windows or block lengths here. They are constants in
-- lib/auth/login-throttle.js, for 006's reason: a policy you have to write a
-- migration to tune is a policy nobody tunes.


begin;


-- ------------------------------------------------------------------ --
-- ip may now be null, meaning "every source".
-- ------------------------------------------------------------------ --
alter table admin_login_attempts
  alter column ip drop not null;


-- ------------------------------------------------------------------ --
-- A row counts SOMETHING.
--
-- Named, so a violation says which rule broke rather than a generated name.
-- ------------------------------------------------------------------ --
alter table admin_login_attempts
  add constraint admin_login_attempts_keyed
    check (email_lower is not null or ip is not null);


-- ------------------------------------------------------------------ --
-- One address-wide counter per address.
--
-- A partial unique index, like 006's two, and for 006's reason: NULLs are
-- distinct in a plain unique index, so without the predicate every attempt
-- would insert a new address-wide row and the ceiling would never accumulate.
-- The application's upsert repeats this predicate as its conflict target.
--
-- 006's pair index (email_lower, ip) where email_lower is not null also
-- covers these rows; with ip null they never collide in it, so it is left
-- exactly as it is.
-- ------------------------------------------------------------------ --
create unique index admin_login_attempts_address
  on admin_login_attempts (email_lower)
  where ip is null;


commit;


-- ------------------------------------------------------------------ --
-- APPLYING THIS
--
-- Paste the whole file. It is one transaction. It changes no existing row:
-- every row already there has a non-null ip, so the new check holds for all of
-- them and the new index starts empty.
--
-- Not safe to re-run - the constraint and the index already exist the second
-- time, which is the point.
-- ------------------------------------------------------------------ --
