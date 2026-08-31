-- 002_create_work_images_table.sql
--
-- Creates the work_images table: several rows per painting.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 003.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon,
-- after 001_create_works_table.sql - this table references works(id), so it
-- cannot be created before it.
--
-- Only `main` images exist today, one scan per painting. `detail` - the
-- close-up of the brushwork at an angle - is what proves the object is a
-- painting and not a print, and `in-situ` is what lets a buyer translate
-- "50 x 70 cm" into a mental picture. Both are conversion drivers, which is
-- why the shape carries them now rather than after a redesign.

create table work_images (
  id uuid primary key default gen_random_uuid(),

  -- Deleting a work takes its images with it. An image row whose painting is
  -- gone is not data worth keeping - it is a broken reference that some later
  -- query will trip over.
  work_id uuid not null references works (id) on delete cascade,

  -- Deliberately not called `path`, `url`, `filename` or `public_id`: it holds
  -- a local path under public/paintings today and a hosted image identifier
  -- once images move to Cloudinary, and a name that describes either one
  -- makes the other read as a bug.
  --
  -- Plain text with no length limit for the same reason. A hosted identifier
  -- carries its own folder prefixes and is longer than a local path, and
  -- neither has a meaningful maximum worth guessing at. No check on its
  -- shape either - a leading-slash constraint would fail the day the value
  -- becomes an identifier rather than a path, and that is exactly the
  -- migration this column exists to avoid.
  image_ref text not null,

  -- The true pixel size of this file. Prefixed `pixel_` against works.width_cm
  -- and works.height_cm, which are the physical canvas in centimetres: two
  -- different quantities about two different objects, and confusing them
  -- produces a layout that is wrong in a way nobody spots by eye.
  --
  -- The layout needs these precisely because a painting is never cropped: to
  -- reserve the right box before the image loads, and so the page does not
  -- shift when it arrives.
  --
  -- NOTE: this supersedes the comment in 001, which said pixel dimensions are
  -- not stored in the database. They are, here. The generated manifest at
  -- lib/data/image-manifest.json reads them out of the files in
  -- public/paintings, and it stops being able to once the files live on a
  -- hosting service - so the manifest is the transitional source and this is
  -- the permanent one. While both exist the manifest wins, because it is
  -- regenerated from the actual files on every build and cannot drift from
  -- them; these columns take over when public/paintings does not exist.
  pixel_width  integer not null check (pixel_width  > 0),
  pixel_height integer not null check (pixel_height > 0),

  -- The role this image plays for the work.
  type text not null check (type in ('main', 'detail', 'in-situ')),

  -- Explicit ordering within the work, not insertion order.
  --
  -- No uniqueness on (work_id, position): the only thing this table enforces
  -- about repetition is the single main image below. Two images sharing a
  -- position is an ordering that is ambiguous, not an ordering that is
  -- corrupt, and the reading query settles it deterministically by ordering
  -- on position and then id.
  position integer not null check (position >= 0),

  -- Optional, per language. Absent means the application derives alt text from
  -- the work's title in that language rather than rendering nothing - alt text
  -- is bilingual content that belongs with the work, never a hardcoded string
  -- in a component.
  --
  -- Nullable rather than defaulted: a default here would be an English or
  -- Hebrew phrase living in the database, and every user-facing string on this
  -- project comes from the locale files.
  alt_he text,
  alt_en text,

  created_at timestamptz not null default now()
);

-- At most one main image per work. It is the grid card, the top of the artwork
-- page and the Open Graph image that gets sent in WhatsApp, so "which image is
-- the painting" must not be a question with two answers.
--
-- A partial unique index rather than a constraint, because the rule applies to
-- one value of `type` and not to the others: detail and in-situ shots may
-- repeat freely, which is the whole point of having them.
create unique index work_images_one_main
  on work_images (work_id) where type = 'main';

-- Every read of this table is "the images for this work, in order".
create index work_images_work_idx on work_images (work_id, position);
