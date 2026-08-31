-- 001_create_works_table.sql
--
-- Creates the works table: one row per painting.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited - a rename reads as a brand-new migration and runs
-- twice. Anything wrong here is corrected by 002, not by touching this file.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon
-- in the same order.
--
-- Requires PostgreSQL 13 or newer for gen_random_uuid(), which is core from 13
-- onwards. On 12 or older, run `create extension if not exists pgcrypto;`
-- first.
--
-- Fields are derived from the work record in lib/data/artworks.js and the
-- schema shape in .claude/rules/database.md. Three things differ from the
-- rules as written, deliberately, and are marked DECISION below.
--
-- Images are NOT in this migration. They are several rows per work with a type
-- and an ordering position (images.md), so they are their own table in a later
-- migration.

create table works (
  -- DECISION 1: the key is an independent generated identifier.
  --
  -- In lib/data/artworks.js the id doubles as the English slug and as the
  -- image filename stem in public/paintings. That coupling ends when images
  -- move to a hosting service, so it is not carried into the database: the
  -- slug per language is its own column below, and the key stands alone with
  -- no meaning outside the database.
  id uuid primary key default gen_random_uuid(),

  -- Public and permanent once live. Changing a published slug breaks every
  -- shared link and discards the page's search history (seo.md), so a title
  -- change does not move a slug.
  --
  -- Unique per language, and separately: the Hebrew slug and the English one
  -- address the same painting, never two rows.
  --
  -- Note that the Hebrew slugs themselves are non-ASCII, but they arrive as
  -- data through a driver that negotiates UTF-8, never as text pasted into a
  -- SQL client. These files stay pure ASCII on purpose: psql on Windows
  -- defaults its client encoding to WIN1252, and a single Hebrew character in
  -- a comment is enough to abort the statement it sits in.
  --
  -- slug_en also happens to match today's filename stems in
  -- public/paintings, which is what the image manifest is keyed by. That is
  -- the only bridge left between the two, and it is why these are the first
  -- columns after the key rather than an afterthought.
  slug_he text not null unique,
  slug_en text not null unique,

  -- Required in both languages. One painting, two language faces - a work
  -- with a title in only one of them is not publishable, and it is the one
  -- text field with no sensible empty state.
  title_he text not null,
  title_en text not null,

  -- Optional: unwritten copy is a real state, and the admin has to show a
  -- missing translation rather than silently falling back (i18n.md). An empty
  -- string could not be told apart from "not written yet".
  description_he text,
  description_en text,

  -- A closed set of keys, not free text. The display strings are translated in
  -- the application from the locale files, so the database stores the key and
  -- never a human-readable phrase in either language.
  --
  -- Nullable on purpose: there is no key for "not recorded yet", and the
  -- medium of the sixteen existing works genuinely is not known. Null is the
  -- honest value - inventing a third key, or defaulting to oil on canvas,
  -- would be exactly the plausible-looking fake data the project rules forbid.
  medium text check (medium in ('oil-on-canvas', 'pastel-on-paper')),

  -- The physical painting, in centimetres. The unit is in the column name so
  -- that these can never be confused with an image's pixel dimensions, which
  -- are a different quantity about a different object and are not stored in
  -- the database at all: they are read from the files themselves by
  -- scripts/generate-image-manifest.mjs (images.md).
  --
  -- numeric, not integer: 30.5 cm is a real canvas size.
  width_cm  numeric(6,1) not null check (width_cm  > 0),
  height_cm numeric(6,1) not null check (height_cm > 0),

  -- Money is a whole number of agorot - the minor unit - plus a currency
  -- code. Never a float, never a formatted string. Storing minor units is
  -- what keeps arithmetic exact and matches what a payment provider will
  -- charge in.
  price_agorot integer not null check (price_agorot >= 0),

  -- DECISION 3: a reduced price, for a work offered at a discount.
  --
  -- A discounted work is still available, so this is a price and never a
  -- status. Null means no discount - not zero, which would be a free
  -- painting. The constraint that it undercuts the regular price is at the
  -- foot of the table.
  price_reduced_agorot integer check (price_reduced_agorot >= 0),

  price_currency char(3) not null default 'ILS',

  -- Optional. Deliberately unconstrained by range: the stand-in value in
  -- lib/data/artworks.js is the year 1000, chosen to be absurd enough that it
  -- cannot ship unnoticed, and a plausible-looking range check here would
  -- reject it and quietly invite someone to "fix" the data instead.
  year integer,

  -- Constrained in the database, not only in application code - a third
  -- category has to be a deliberate migration. It exists as a field precisely
  -- so collection pages can be added later without one.
  category text not null check (category in ('landscape', 'still-life')),

  -- Four values, never a boolean (commerce.md): a boolean cannot express a
  -- work on hold for a buyer who is still deciding, one the artist is
  -- keeping, or one that sold somewhere else.
  --
  -- No default: anything inserting a work has to say what state it is in.
  status text not null check (status in ('available', 'reserved', 'sold', 'not-for-sale')),

  -- Optional. Which channel a work sold through - the artist sells in
  -- parallel on under1000, so this site is not the only thing that can
  -- consume a painting.
  --
  -- Deliberately not tied by a constraint to status = 'sold'. The artist may
  -- reasonably record the channel in either order while updating a work, and
  -- a constraint that fails on the intermediate state is a constraint she
  -- would have to phone her son about.
  sale_channel text check (sale_channel in ('this-site', 'under1000', 'elsewhere')),

  -- DECISION 2: publication is a separate axis from sale status.
  --
  -- Null means a draft: the work exists in the admin and is not visible on the
  -- public site. A draft may hold any of the four sale statuses, which is
  -- precisely why this is not folded into `status` as a fifth value - a work
  -- can be sold and unpublished, or available and unpublished.
  --
  -- A timestamp rather than a boolean, because "when did this go live" is
  -- worth knowing and a boolean throws it away. Null by absence of a default,
  -- so a record created by any future folder-watching import lands as a draft
  -- without the importer having to remember to make it one (commerce.md).
  published_at timestamptz,

  -- Marks the homepage hero work.
  featured boolean not null default false,

  -- Flags the deliberately absurd stand-in price, size, year, medium and
  -- description, and drives the visible "sample price" marker in the UI.
  -- Defaults to true: a new record is assumed incomplete until something says
  -- otherwise, which fails in the safe direction.
  has_placeholder_data boolean not null default true,

  -- What "most recent" orders by: when the work joined the catalogue. A fact
  -- about the painting, and editable - distinct from created_at, which is a
  -- fact about the row and is not.
  added_at date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A discount that does not undercut the price is a data-entry mistake, and
  -- the place to catch it is here rather than in a form that can be bypassed.
  constraint works_reduced_price_below_price
    check (price_reduced_agorot is null or price_reduced_agorot < price_agorot)
);

-- The homepage grid and the gallery both read newest-first, with the key
-- breaking ties the way the repository's byMostRecent already does.
create index works_added_at_idx on works (added_at desc, id);

-- The public site reads only published works, so the filter is in the index
-- rather than applied after it.
create index works_published_idx on works (added_at desc) where published_at is not null;

-- NOT requested in the brief - say the word and it comes out before you apply
-- this. At most one featured work: a unique index over a constant expression,
-- restricted to featured rows, makes two heroes impossible rather than merely
-- discouraged. Zero is still allowed, and the repository already falls back to
-- the most recent work when nothing is featured.
create unique index works_single_featured on works ((true)) where featured;
