-- 011_create_site_settings_table.sql
--
-- Creates site_settings: the handful of facts about the studio that the artist
-- should be able to change without a developer - the About text, how to reach
-- her, where she is on social media, what shipping costs, whether a painting
-- can be collected, and her portrait.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 012.
--
-- Run by hand, against local Postgres first and later against Neon, after
-- 010_add_order_refund_due.sql. Nothing here references another table, so the
-- order only matters because the numbering says so.
--
-- ASCII only, comments included. See .claude/rules/database.md.
--
--
-- WHY ONE ROW WITH A COLUMN PER FIELD, AND NOT A KEY-VALUE TABLE
--
-- The list is closed and small, and every entry has a type. A key-value table
-- stores all of them as text, so "is the shipping rate a non-negative number
-- of agorot" and "is pickup on or off" become questions the application has to
-- answer on every read, and a typo'd key is a setting that silently never
-- exists. As columns, the database answers them: a rate of "40.00" or -1, a
-- pickup flag of "yes", or a field nobody declared is refused on write.
--
-- The cost is that adding a setting is a migration. For a list this size that
-- is the right price - the same trade as the closed sets on works.
--
--
-- WHY AN EMPTY FIELD IS NULL, AND NEVER ''
--
-- Every optional field starts empty, and empty is a legitimate state meaning
-- "not provided" - no placeholder text, no example address. The application
-- renders nothing for it rather than a dead link or a bracketed stand-in.
--
-- There is exactly one way to say it. Each text column refuses a value that is
-- blank once trimmed, so null is "not provided" and anything present is
-- something somebody actually typed. Two spellings of absent is how one caller
-- checks for null, another for '', and a footer renders an empty mailto.
--
--
-- WHAT DELETING THE ROW DOES
--
-- Nothing stops it, deliberately. The application never deletes this row, and
-- a trigger to forbid it would be the first trigger in the schema, bought for
-- a statement nobody runs. The read instead fails loudly if the row is absent,
-- naming this file, so the failure explains itself.


begin;


create table site_settings (

  -- ---------------------------------------------------------------- --
  -- One row, and the key is what makes it one.
  --
  -- A boolean primary key that may only be true has exactly one possible
  -- value, so a second insert collides with the first on the primary key
  -- whatever it carries. Nothing has to remember to check.
  -- ---------------------------------------------------------------- --
  id boolean primary key default true
    constraint site_settings_single_row check (id),


  -- ---------------------------------------------------------------- --
  -- About the artist, in both languages or in neither.
  --
  -- The English follows the same approval flow the works' descriptions do:
  -- translated from her Hebrew, arriving unapproved, and the form refusing to
  -- save until she has read it. That gate is form state, not a column - see
  -- i18n.md - so the database cannot know whether the English was approved.
  --
  -- What it CAN enforce is the half that makes the gate impossible to step
  -- around: a Hebrew text with no English beside it is not storable. The form
  -- will not save an unapproved translation, and this refuses a save with no
  -- translation at all, so the only way to publish an About text is with an
  -- English one somebody signed off. Neither half alone closes it.
  -- ---------------------------------------------------------------- --
  about_he text
    constraint site_settings_about_he_not_blank check (btrim(about_he) <> ''),
  about_en text
    constraint site_settings_about_en_not_blank check (btrim(about_en) <> ''),


  -- ---------------------------------------------------------------- --
  -- How to reach her.
  --
  -- No format check on email or phone, deliberately. An email pattern that is
  -- strict enough to mean anything rejects real addresses, and a phone number
  -- here is for reading, not dialling - she may want it written as she says
  -- it. Validation of shape belongs at the boundary, where the error can be
  -- shown to her in Hebrew.
  -- ---------------------------------------------------------------- --
  email text
    constraint site_settings_email_not_blank check (btrim(email) <> ''),
  phone text
    constraint site_settings_phone_not_blank check (btrim(phone) <> ''),

  -- The WhatsApp number is the exception, because it is not read by a person:
  -- it goes into a wa.me link, which accepts only the international form -
  -- country code, no plus, no leading zero, no separators. 052-432-1817 is
  -- 972524321817. A local number stored here would be a floating button on
  -- every public page that opens a chat with nobody. E.164 allows at most
  -- fifteen digits.
  whatsapp_number text
    constraint site_settings_whatsapp_international
      check (whatsapp_number ~ '^[1-9][0-9]{7,14}$'),


  -- ---------------------------------------------------------------- --
  -- Social links.
  --
  -- Each becomes an href in the footer of every public page, so the scheme is
  -- constrained: https and nothing else. That is less about tidiness than
  -- about a javascript: or data: URL typed into a settings form being
  -- rendered as a link on the shop. Which domain it points at is left to the
  -- boundary - an account can move between hosts, and a URL shortener is not
  -- the database's business.
  -- ---------------------------------------------------------------- --
  instagram_url text
    constraint site_settings_instagram_https check (instagram_url ~ '^https://'),
  facebook_url text
    constraint site_settings_facebook_https check (facebook_url ~ '^https://'),


  -- ---------------------------------------------------------------- --
  -- Delivery.
  --
  -- The rate is in AGOROT, like every other amount in this schema, so nothing
  -- converts between here and orders.delivery_fee_agorot. It is what the
  -- checkout would charge NOW; what an existing order was charged is on that
  -- order and is never recomputed from this - see 009. That is the reason this
  -- column can be edited at all.
  --
  -- Zero is permitted. A free-shipping promotion is a legitimate business
  -- decision, and 009 declined to pin the shipping fee for the same reason.
  --
  -- Required, with no default on either column: a default rate is a price
  -- nobody chose, and a default pickup setting is a delivery promise nobody
  -- made. The one row is inserted below with both stated.
  --
  -- Turning pickup off changes what the checkout offers from then on. It does
  -- not touch an order already placed for pickup, which 009 still permits.
  -- ---------------------------------------------------------------- --
  shipping_fee_agorot integer not null
    constraint site_settings_shipping_fee_non_negative check (shipping_fee_agorot >= 0),
  self_pickup_offered boolean not null,


  -- ---------------------------------------------------------------- --
  -- Her portrait, stored the way work_images stores a painting.
  --
  -- image_ref's reasoning carries over whole: a local path or a hosted
  -- identifier, told apart by the application by a leading slash, and named
  -- for neither. The pixel dimensions are the file's own, read back from the
  -- host rather than reported by a browser - they reserve the box the
  -- portrait is drawn in, exactly as they do for a painting.
  --
  -- No alt text columns. The alt is derived from the artist's name in the
  -- locale files, which is what a work does when its own alt is absent, and
  -- nothing would write them.
  -- ---------------------------------------------------------------- --
  portrait_image_ref text
    constraint site_settings_portrait_ref_not_blank check (btrim(portrait_image_ref) <> ''),
  portrait_pixel_width integer
    constraint site_settings_portrait_width_positive check (portrait_pixel_width > 0),
  portrait_pixel_height integer
    constraint site_settings_portrait_height_positive check (portrait_pixel_height > 0),


  -- No trigger - the application sets it on every write, as it does on works.
  updated_at timestamptz not null default now(),


  -- ---------------------------------------------------------------- --
  -- The About text is a pair.
  --
  -- Both present or both null. See the note on the columns above for why this
  -- is the database's half of the approval gate.
  -- ---------------------------------------------------------------- --
  constraint site_settings_about_both_languages
    check ((about_he is null) = (about_en is null)),

  -- ---------------------------------------------------------------- --
  -- A portrait is all three or none.
  --
  -- A reference with no dimensions cannot reserve its box, and dimensions
  -- with no reference describe nothing. Either is a half-written upload.
  -- ---------------------------------------------------------------- --
  constraint site_settings_portrait_complete
    check (
      (portrait_image_ref is null
        and portrait_pixel_width is null
        and portrait_pixel_height is null)
      or
      (portrait_image_ref is not null
        and portrait_pixel_width is not null
        and portrait_pixel_height is not null)
    )
);


-- ------------------------------------------------------------------ --
-- The row itself, with today's real values and nothing invented.
--
-- The WhatsApp number is the one lib/contact.js carries, confirmed for this
-- site on 19-09-2026. The rate is lib/delivery.js's 40 ILS flat, in agorot,
-- and pickup is on because the checkout offers it today. Everything else is
-- null: not provided yet.
-- ------------------------------------------------------------------ --
insert into site_settings (whatsapp_number, shipping_fee_agorot, self_pickup_offered)
values ('972524321817', 4000, true);


commit;


-- ------------------------------------------------------------------ --
-- APPLYING THIS
--
-- Paste the whole file. It is one transaction: the table and its row land
-- together or not at all, so there is no state in which the table exists
-- empty and every public page fails for want of a row.
--
-- Not safe to re-run - the create fails on the existing table, which is the
-- point.
-- ------------------------------------------------------------------ --
