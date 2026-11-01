-- 016_allow_additional_work_images.sql
--
-- Lets a work carry up to three images beside its main one, and makes the
-- database itself refuse a fourth.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 017.
--
-- Run by hand, after 015_allow_many_featured_works.sql, against the local
-- database and against Neon. One transaction: the new type, the position rule
-- and the index land together or not at all.
--
-- ASCII only, comments included. See .claude/rules/database.md.
--
--
-- WHY NOT A NEW TABLE
--
-- work_images already holds everything an additional image needs: an order
-- (position), the file's real pixel dimensions, optional alt text in both
-- languages, and on delete cascade from works, so deleting a work removes its
-- images in the same statement. The public artwork page and its full-screen
-- view already show every image of a work that is not the main one. A second
-- table would repeat all of that and be one more place a work's images live.
--
--
-- WHAT CHANGES
--
-- 1. A fourth type, 'additional': a photograph the artist added beside the
--    main one, without saying what kind of shot it is. 'detail' and 'in-situ'
--    stay, unused, for the day the admin asks.
--
-- 2. Every image that is not the main one sits in position 1, 2 or 3
--    (work_images_extra_position), and no two of them share a position within
--    a work (work_images_extra_slot). Three slots, one image each: that is
--    what makes a fourth impossible, for any type but 'main', with no
--    trigger. The main image is untouched - it stays at position 0 and
--    work_images_one_main still allows exactly one.
--
--    001's note that position is deliberately not unique still holds for the
--    main image; for the others it no longer does, because the slot is now
--    the limit. The order is the order she added them in, which the
--    application writes as 1, 2, 3.
--
-- Every row that exists today is a main image, so nothing already stored can
-- violate the new rules. If one does on some database, the whole file rolls
-- back and that row is the thing to look at.
--
-- The code that writes additional images ships in the same change. Without
-- this migration, saving a work that carries one fails on the type check.

begin;

alter table work_images drop constraint work_images_type_check;

alter table work_images add constraint work_images_type_check
  check (type in ('main', 'detail', 'in-situ', 'additional'));

alter table work_images add constraint work_images_extra_position
  check (type = 'main' or position between 1 and 3);

create unique index work_images_extra_slot
  on work_images (work_id, position) where type <> 'main';

commit;
