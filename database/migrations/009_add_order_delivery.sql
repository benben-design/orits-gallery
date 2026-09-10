-- 009_add_order_delivery.sql
--
-- Adds how an order reaches its buyer, and what the delivery cost them.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 010.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon,
-- after 007_add_order_status_dates.sql - it rewrites one of 007's constraints.
--
-- ASCII only, comments included. psql on Windows defaults its client encoding
-- to WIN1252 and a single character without a WIN1252 equivalent aborts the
-- statement it sits in. See .claude/rules/database.md. 008 is the one file here
-- that cannot obey that rule, because its data is Hebrew by definition; this
-- one can, so it does.
--
--
-- WHY THIS FILE EXISTS
--
-- An order could say what was bought and what it cost, and nothing at all about
-- how the painting was going to reach the person who bought it. There are two
-- ways it can, they cost different amounts, and one of them needs a postal
-- address while the other must not have one:
--
--   shipping     flat rate, anywhere in Israel, needs an address
--   self-pickup  free, collected from the artist, has no address
--
--
-- WHY THE FEE IS STORED AND NEVER RECOMPUTED
--
-- The rate will change. It is 40 ILS today, it lives in exactly one place in
-- code (lib/delivery.js), and it is expected to move to an admin setting. The
-- moment it changes, any code that recomputed an old order's delivery cost from
-- the current rate would rewrite what that buyer was charged - silently, and in
-- a record that has to read the same in three years in front of an accountant.
--
-- So the fee is a column, written once at checkout and read back afterwards as
-- a fact. That is the rule order_lines.price_agorot already follows for the
-- paintings themselves, applied to the one other thing on the invoice.
--
-- Agorot, like every other amount in this schema. Integer, never a float.
--
-- It is a COMPONENT of total_agorot rather than something to add to it: the
-- total is what was charged, delivery included. Nothing enforces that
-- arithmetic, for the reason 003 already gave about the line prices - a trigger
-- firing mid-checkout is a way to fail a payment that has already gone through.
-- Keeping the two in step is the checkout's job.
--
--
-- WHY THE PICKUP FEE IS CONSTRAINED AND THE SHIPPING FEE IS NOT
--
-- Pickup is free by definition: there is no carrier and nothing to pay for, so
-- a pickup order carrying a delivery charge is a wrong charge, and the database
-- refuses it outright.
--
-- The shipping fee is deliberately left unconstrained beyond being >= 0, and
-- that is not laziness. Pinning it to 4000 would put today's price list in the
-- schema, where changing it is a migration - and where an old order would fail
-- its own table's constraint the day the rate moved. Free shipping as a
-- promotion would be refused too. This column's job is to record what was
-- charged, not to agree with what we charge now.
--
-- The line is the one 007 drew: enforce what cannot be recovered, or what is
-- never legitimately otherwise; stay silent where the business may reasonably
-- change its mind.
--
--
-- WHY shipping_address LOSES ITS NOT NULL
--
-- 003 made it required, which was right when posting the painting was the only
-- way to get it. A self-pickup order has no address - not an empty one, and not
-- the artist's own studio address typed into the buyer's field, which is what a
-- NOT NULL column forces somebody to invent. An invented address on an order is
-- worse than an absent one, because it looks like a fact.
--
-- So the requirement becomes conditional: present for shipping, absent for
-- pickup. Two constraints rather than one, so a violation names which half
-- broke - the admin has to explain these in Hebrew, and it cannot do that from
-- a constraint that only says "the address is wrong".
--
-- Note what is deliberately NOT added: a check that a shipping address is
-- non-blank. An empty string was already accepted by the NOT NULL this file
-- relaxes, so nothing regresses - and 003 is explicit that format validation
-- belongs at the boundary, where the error can be shown in the language the
-- buyer is reading. This file changes whether an address is required, not what
-- counts as one.
--
--
-- THE CORRECTION TO 007
--
-- 007 required shipped_at for both 'shipped' and 'delivered', because every
-- order was posted and a painting cannot arrive without having been sent.
--
-- A pickup order breaks that, and it breaks it in the direction that matters:
-- it is never shipped at all. The artist hands the painting over, and that one
-- act is both dispatch and receipt. Forcing a shipped_at would mean inventing a
-- date nobody observed, on the very columns 007 exists to keep honest.
--
-- Israeli law counts the 14-day cancellation window from RECEIPT, so what has
-- to be recorded is delivered_at - and a pickup order has a real one. What it
-- does not have is a dispatch. So:
--
--   * 'shipped' still requires shipped_at. That status means it was posted.
--   * 'delivered' requires shipped_at only when the method is shipping.
--   * a pickup order may never be 'shipped' and may never carry a shipped_at at
--     all, so the absence is enforced rather than merely permitted.
--
-- paid -> delivered in one step is therefore a legal path, for pickup only.
--
--
-- THE HOLE THAT CORRECTION OPENS, AND WHY THIS FILE CLOSES IT
--
-- 007 enforced the ordering of the chain as paid_at <= shipped_at <=
-- delivered_at. Both halves are silent when shipped_at is null, which was
-- harmless while every delivered order had one: together they implied
-- paid_at <= delivered_at.
--
-- A pickup order has no shipped_at, so that implication is gone, and a receipt
-- dated before its own payment would pass every constraint in 007. That is
-- exactly the transposition 007's ordering checks exist to catch, and it would
-- produce a cancellation window that is wrong and that nothing anywhere would
-- complain about.
--
-- orders_paid_before_delivered closes it directly. It is redundant for a
-- shipping order and stated anyway, because a constraint that holds only as a
-- side effect of two others is one change away from not holding.


-- ------------------------------------------------------------------ --
-- ONE TRANSACTION, for the reason 007 gave
--
-- Nine statements against a table that already exists, and pgAdmin's query tool
-- auto-commits each one as it goes. Without the wrapper, a failure halfway
-- leaves 007's dispatch constraint dropped and its replacement missing - which
-- means the table would accept a delivered order with no dispatch date, on the
-- table that is about to hold money records. All of it, or none of it.
-- ------------------------------------------------------------------ --
begin;


-- ------------------------------------------------------------------ --
-- How the painting gets there
--
-- No default, deliberately, and for the same reason status has none: there is
-- no method safe enough to assume. A default of 'shipping' would make every
-- insert that forgot to ask silently charge 40 ILS and demand an address; a
-- default of 'self-pickup' would silently waive the fee. An insert that does not
-- say fails instead.
--
-- NOT NULL added directly because orders is empty. On a table with rows this
-- would be three steps: add nullable, backfill, then set not null.
-- ------------------------------------------------------------------ --
alter table orders
  add column delivery_method text not null
    constraint orders_delivery_method_supported
      check (delivery_method in ('shipping', 'self-pickup'));


-- ------------------------------------------------------------------ --
-- What the delivery cost, in agorot
--
-- Also without a default. A missing fee defaulting to 0 is an order that
-- silently shipped for free, which is a number nobody would think to check.
-- ------------------------------------------------------------------ --
alter table orders
  add column delivery_fee_agorot integer not null
    constraint orders_delivery_fee_nonnegative
      check (delivery_fee_agorot >= 0);

alter table orders add constraint orders_pickup_is_free
  check (delivery_method <> 'self-pickup' or delivery_fee_agorot = 0);


-- ------------------------------------------------------------------ --
-- The address, conditional now rather than always required
-- ------------------------------------------------------------------ --
alter table orders alter column shipping_address drop not null;

alter table orders add constraint orders_shipping_requires_address
  check (delivery_method <> 'shipping' or shipping_address is not null);

alter table orders add constraint orders_pickup_has_no_address
  check (delivery_method <> 'self-pickup' or shipping_address is null);


-- ------------------------------------------------------------------ --
-- 007's dispatch rule, split in three
--
-- The old constraint named both statuses at once. It is dropped and replaced, so
-- that each rule says one thing and a violation names which one broke.
-- ------------------------------------------------------------------ --
alter table orders drop constraint orders_shipped_requires_shipped_at;

-- Posted means posted, whatever the method. Unchanged in meaning, narrower in
-- scope: it no longer speaks for 'delivered'.
alter table orders add constraint orders_shipped_requires_shipped_at
  check (status <> 'shipped' or shipped_at is not null);

-- A posted painting cannot arrive without having been sent. Pickup is silent
-- here, and that silence is the whole correction.
alter table orders add constraint orders_shipping_delivered_requires_shipped_at
  check (
    status <> 'delivered'
    or delivery_method <> 'shipping'
    or shipped_at is not null
  );

-- And a pickup order has no dispatch to record, so it may not claim one. Both
-- halves: never that status, never that date.
alter table orders add constraint orders_pickup_never_ships
  check (
    delivery_method <> 'self-pickup'
    or (status <> 'shipped' and shipped_at is null)
  );


-- ------------------------------------------------------------------ --
-- The ordering 007 implied and can no longer guarantee
--
-- See the note above. Redundant where shipped_at exists, load-bearing where it
-- does not.
-- ------------------------------------------------------------------ --
alter table orders add constraint orders_paid_before_delivered
  check (paid_at is null or delivered_at is null or paid_at <= delivered_at);


commit;


-- ------------------------------------------------------------------ --
-- No new index
--
-- Nothing filters orders by delivery method, and at one or two sales a month the
-- admin's list reads every row it has.
--
--
-- WHAT IS STILL FORBIDDEN, unchanged from 007
--
--   pending     all five dates absent
--   paid        paid_at
--   shipped     paid_at, shipped_at
--   delivered   paid_at, delivered_at, and shipped_at IF shipping
--   cancelled   cancelled_at
--   refunded    paid_at, refunded_at
--
--   paid_at <= shipped_at <= delivered_at, and now paid_at <= delivered_at.
--
-- The two exits 007 left deliberately unconstrained are untouched: whether a
-- cancelled order carries paid_at, and whether a refunded one carries dispatch
-- or receipt.
--
-- The single relaxation is the one named above: 'delivered' no longer demands a
-- dispatch date from an order that was never dispatched.
--
--
-- APPLYING THIS
--
-- Paste the whole file. begin/commit means a failure anywhere rolls all of it
-- back and the table is untouched, so there is nothing half-applied to
-- diagnose and nothing to clean up before trying again.
--
-- orders was empty when this was written, so the two new NOT NULL columns
-- validate against no rows. Applied later to a table with orders in it, both
-- ALTERs would fail outright - correctly, because there would be no honest value
-- to backfill either column with, and that is a decision for whoever has those
-- rows in front of them rather than one to guess at here.
-- ------------------------------------------------------------------ --
