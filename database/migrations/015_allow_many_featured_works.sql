-- 015_allow_many_featured_works.sql
--
-- Turns works.featured from "the one homepage hero" into "shown on the
-- homepage", which any number of works may be.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 016.
--
-- Run by hand, after 014_add_payment_return_throttle.sql, against the local
-- database and against Neon. One transaction: the index and the starting
-- selection land together or not at all.
--
-- ASCII only, comments included. See .claude/rules/database.md.
--
--
-- WHY THE INDEX GOES
--
-- 001 allowed at most one featured work (works_single_featured), because the
-- homepage hero was going to be a painting and two heroes made no sense. The
-- hero became studio footage, and nothing read the flag after that. It now
-- means the artist starred the work in the admin's list, and the homepage grid
-- shows every starred work. A cap of one would refuse the second star.
--
-- No new column: the flag already exists, is boolean, not null, and defaults
-- to false - exactly what "not starred" should be for a new work. The code
-- that writes the second star ships in the same change, so this must be on a
-- database before that code runs against it, or starring a second work fails
-- on the index.
--
--
-- THE STARTING SELECTION
--
-- Until now the homepage showed the twelve most recently added published
-- works. Those twelve are starred here, so the homepage reads the same the
-- moment this lands, and the stars in the admin say what the page is showing.
-- The ordering is the repository's MOST_RECENT (added_at desc, slug_en asc).
-- Every other work is cleared, which also removes whatever single flag the
-- seed fixture left on a local database.
--
-- On each database this picks that database's own twelve, which is the point:
-- local and Neon hold different catalogues, and each homepage keeps showing
-- what it showed.

begin;

drop index if exists works_single_featured;

-- Only rows whose flag actually changes are written, so updated_at keeps
-- meaning "the artist last changed this".
with shown as (
  select id
    from works
   where published_at is not null
   order by added_at desc, slug_en asc
   limit 12
)
update works
   set featured = (works.id in (select id from shown)),
       updated_at = now()
 where works.featured is distinct from (works.id in (select id from shown));

commit;
