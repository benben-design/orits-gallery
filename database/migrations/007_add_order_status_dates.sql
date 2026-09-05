-- 007_add_order_status_dates.sql
--
-- Adds the date each of an order's statuses happened, and a sixth status:
-- delivered.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 008.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon,
-- after 003_create_orders_tables.sql.
--
-- ASCII only, comments included. psql on Windows defaults its client encoding
-- to WIN1252 and a single character without a WIN1252 equivalent aborts the
-- statement it sits in. See .claude/rules/database.md.
--
--
-- WHY THIS FILE EXISTS NOW
--
-- 003 recorded when an order was created and when it was last touched, and
-- nothing else about time. That is enough to list orders, and not enough to
-- answer the one question about them that is not ours to decline: how long the
-- buyer has to cancel.
--
-- Israeli consumer law counts the 14-day window from the buyer RECEIVING the
-- painting. With only created_at and updated_at, the moment an order moved
-- from paid to shipped its payment date was gone - overwritten by a column
-- meaning "last edited" - so the window could not be computed, and could not
-- be reconstructed afterwards either. commerce.md and database.md have both
-- carried that as a recorded gap since 003. This is that gap closed.
--
-- Nothing in the application reads or writes orders yet: /admin/orders and
-- /admin/orders/[id] are stubs, and no repository function touches either
-- table. So this migration has no application layer to keep in step, which is
-- precisely why it is worth doing now rather than in the middle of building
-- checkout.
--
--
-- WHY COLUMNS AND NOT A STATUS-HISTORY TABLE
--
-- The usual shape for this is one row per transition, with the dates derived
-- by querying them. It is rejected here, and not only because this shop sells
-- one or two paintings a month.
--
-- With a history table, "when was this paid" is a query with an order by and a
-- limit that can legitimately return no rows - so every reader has to handle
-- the absent case forever, and a paid order with no payment event is a state
-- the database will happily store. With a column and a check constraint that
-- state cannot be written at all. The choice is not between a simple mechanism
-- and a thorough one; it is between a schema that permits the broken row and
-- one that does not.
--
-- The same reasoning kept the cart out of the database entirely.
--
-- It costs one thing, and it is worth saying plainly: a status set wrongly and
-- then corrected leaves no trace of the mistake. At this volume that is a fair
-- price for a shape in which the dates cannot go missing.
--
--
-- WHY delivered IS A STATUS AND NOT ONLY A DATE
--
-- Two reasons, and either alone would be enough.
--
-- Legally, the window runs from receipt. Dispatch is not receipt: computing it
-- from shipped_at would close the window EARLIER than the law does, which is
-- the one direction it must not be wrong in, because it is the direction that
-- shortens the buyer's rights. A column holding the date the statute actually
-- counts from is the only thing that closes what 003 left open.
--
-- Operationally, "which orders are still on the way" is the question the
-- artist actually asks of this list, and it only has an answer if there is a
-- state after shipped. With shipped terminal, an order posted in March is
-- still "on the way" in September: the filter accumulates everything ever sent
-- and stops being read. delivered is what closes a shipped order.
--
-- The cost is a click when a buyer says it arrived. At one or two sales a
-- month that is not admin busywork - it is the click that starts a clock she
-- is bound by.
--
--
-- WHY THIS TABLE ENFORCES THE PAIR AND works DELIBERATELY DOES NOT
--
-- Read beside 001 this file looks like a contradiction, so the difference is
-- stated here rather than left for someone to pick a side of. 001 says of
-- works.sale_channel: "Deliberately not tied by a constraint to status =
-- 'sold' ... a constraint that fails on the intermediate state is a constraint
-- she fights." Here the equivalent pairing IS a constraint. Both are right.
--
-- works.sale_channel is descriptive, typed by hand, in a form the artist moves
-- through in whatever order suits her. A constraint there fires on a
-- half-filled form and teaches her to dread saving - and getting it wrong
-- loses nothing that cannot be typed again.
--
-- These dates are written by a payment webhook and by one deliberate click,
-- never mid-edit, so there is no intermediate state for a constraint to fight.
-- And a missing paid_at is not a field to fill in later: the moment is gone,
-- nothing else in the row implies it, and what it decides is a legal deadline.
--
-- Enforce where the loss is permanent; guide where it is not.
--
--
-- WHAT IS ENFORCED, AND WHAT IS DELIBERATELY SILENT
--
-- Enforced - the forward chain, because every date in it is unrecoverable if
-- it is not written at the moment it happens:
--
--   pending     all five dates absent
--   paid        paid_at
--   shipped     paid_at, shipped_at
--   delivered   paid_at, shipped_at, delivered_at
--   cancelled   cancelled_at
--   refunded    paid_at, refunded_at
--
--   and paid_at <= shipped_at <= delivered_at.
--
-- Silent - the exits, because on those the payment provider may legitimately
-- be right in more than one way:
--
--   * Whether a cancelled order carries paid_at. The chosen provider
--     documents transaction authorization separately from capture, so an order
--     authorised and then voided before capture is a real state in this stack.
--     Forcing it to be a refund would be the constraint fighting the provider.
--
--   * Whether a refunded order carries shipped_at and delivered_at. Refunding
--     before dispatch and refunding after delivery are both legitimate, and a
--     constraint that picked one would be wrong half the time.
--
-- The line: enforce what is unrecoverable if lost, stay silent where the
-- provider may legitimately be right.
--
--
-- THE GAP THIS FILE DOES NOT CLOSE
--
-- An order whose receipt is never marked has no computable statutory window.
-- Its status stays shipped, delivered_at stays null, and nothing in this
-- schema can tell that apart from a parcel genuinely still in transit.
--
-- That is deliberate, and it is not a schema problem. No constraint can make
-- somebody confirm a delivery, and a default would invent a date nobody
-- observed - which is worse than an absent one, because it would be believed
-- and counted from. The remedy belongs to the admin's orders list: surfacing
-- dispatches that were never closed, so an old shipped order is visible rather
-- than silently uncountable. It is written down here so that it is a known
-- consequence of this design and not a surprise discovered later.


-- ------------------------------------------------------------------ --
-- ONE TRANSACTION, WHICH NO EARLIER MIGRATION NEEDED
--
-- 001 through 004 and 006 create tables: a partial failure there leaves a
-- table that obviously is not finished, and the fix is to drop it and run the
-- file again. 005 is a single statement, atomic by itself. None of them wraps
-- anything, and none of them had to.
--
-- This file is eleven statements against a table that already exists, and
-- pgAdmin's query tool runs with auto-commit on by default - each statement
-- commits as it goes. Without the wrapper, a failure at statement seven leaves
-- orders_status_check dropped, the columns added and three of the eight
-- constraints in place. Forward-only then means 008 has to work out what
-- actually landed before it can correct anything, on the table that is about
-- to hold money records.
--
-- So: all of it, or none of it. Postgres applies DDL transactionally, which is
-- what makes this possible at all - it is not true of every database, and it
-- is worth knowing that it is true of this one.
-- ------------------------------------------------------------------ --
begin;


-- ------------------------------------------------------------------ --
-- The sixth status
--
-- 003 wrote its status check inline and unnamed, so Postgres generated the
-- name. It was read back from the database rather than assumed:
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'orders'::regclass and contype = 'c';
--
-- It is orders_status_check. Everything this file adds is named explicitly, so
-- the next file that has to touch one is two lines rather than a lookup - the
-- same lesson 005 already applied to orders_buyer_locale_supported.
-- ------------------------------------------------------------------ --
alter table orders drop constraint orders_status_check;

alter table orders add constraint orders_status_supported
  check (status in ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'));


-- ------------------------------------------------------------------ --
-- The dates
--
-- All nullable, because each is absent until the thing it records has
-- happened. WHICH of them must be present is a question about the status, and
-- it is answered by the constraints below - a not null here would make a
-- pending order unstorable.
--
-- timestamptz, like every other moment in this schema. The law counts days,
-- but what is stored is the instant; turning that into a date is a question
-- about a timezone, and it belongs where the answer is displayed.
-- ------------------------------------------------------------------ --
alter table orders
  add column paid_at      timestamptz,
  add column shipped_at   timestamptz,
  add column delivered_at timestamptz,
  add column cancelled_at timestamptz,
  add column refunded_at  timestamptz;


-- ------------------------------------------------------------------ --
-- The forward chain
--
-- One constraint per rule rather than one constraint holding all of them, so a
-- violation names the rule that broke in its own error. The admin has to
-- explain these in plain Hebrew, and it cannot do that from a constraint that
-- only says "some date is missing" - the same reasoning as the order_lines
-- note in 003.
--
-- Each is written as "the status is not one of these, or the date is present",
-- so every constraint is silent about every status it does not name. That
-- shape is what lets the exits below stay unconstrained.
-- ------------------------------------------------------------------ --

-- Nothing has happened to a pending order yet, so no date on it can have one.
alter table orders add constraint orders_pending_has_no_dates
  check (
    status <> 'pending'
    or (paid_at is null and shipped_at is null and delivered_at is null
        and cancelled_at is null and refunded_at is null)
  );

-- Money moved. Every status at or past paid carries the date it moved,
-- INCLUDING refunded: a refund does not erase the payment that preceded it,
-- and the payment date is what the tax record is built on.
alter table orders add constraint orders_paid_requires_paid_at
  check (
    status not in ('paid', 'shipped', 'delivered', 'refunded')
    or paid_at is not null
  );

-- It left. delivered is named here too, because a painting cannot arrive
-- without having been sent.
alter table orders add constraint orders_shipped_requires_shipped_at
  check (status not in ('shipped', 'delivered') or shipped_at is not null);

-- It arrived. This is the date the 14-day cancellation window is counted from,
-- and it is the reason this migration exists.
alter table orders add constraint orders_delivered_requires_delivered_at
  check (status <> 'delivered' or delivered_at is not null);

-- Cancelled says nothing about paid_at, on purpose - see the note above on
-- authorization and capture. It does still have to say when.
alter table orders add constraint orders_cancelled_requires_cancelled_at
  check (status <> 'cancelled' or cancelled_at is not null);

-- What was never paid cannot be refunded, and paid_at is required for this
-- status by the constraint above. This one adds the date of the refund itself.
alter table orders add constraint orders_refunded_requires_refunded_at
  check (status <> 'refunded' or refunded_at is not null);


-- ------------------------------------------------------------------ --
-- The order of the chain
--
-- Presence alone is not enough. A transposed pair - a dispatch dated before
-- its own payment, a receipt before its dispatch - produces a cancellation
-- window that is wrong and that nothing anywhere would complain about. These
-- two are cheap, and they catch it at the write rather than in front of a
-- customer.
--
-- Both are silent when either side is null, so neither fires on an order that
-- has simply not got there yet.
--
-- Deliberately not extended to refunded_at: a refund may legitimately fall
-- before dispatch or after delivery, so there is no position in the chain to
-- assert for it. See the silence note above.
-- ------------------------------------------------------------------ --
alter table orders add constraint orders_paid_before_shipped
  check (paid_at is null or shipped_at is null or paid_at <= shipped_at);

alter table orders add constraint orders_shipped_before_delivered
  check (shipped_at is null or delivered_at is null or shipped_at <= delivered_at);


commit;


-- ------------------------------------------------------------------ --
-- No new index
--
-- orders_status_idx from 003 already covers filtering the list by any of the
-- six values, the "still on the way" case included. At this volume an index on
-- a date column would earn nothing.
--
--
-- APPLYING THIS
--
-- Paste the whole file. The begin/commit above means a failure anywhere rolls
-- the lot back and the table is untouched, so there is no half-applied state
-- to diagnose and nothing to clean up before trying again.
--
-- Every constraint above validates the rows already in the table. orders was
-- empty when this file was written, on the only database that exists - there
-- is still no Neon - so nothing is being validated against. Applied later to a
-- table with rows in it, a row predating these rules fails the alter rather
-- than being quietly grandfathered. That is correct: the alternative is a
-- table asserting an invariant it does not hold - and with the wrapper, that
-- failure costs nothing but the message.
-- ------------------------------------------------------------------ --
