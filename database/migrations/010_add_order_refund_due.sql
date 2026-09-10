-- 010_add_order_refund_due.sql
--
-- Records that money was taken for a painting we cannot deliver, and could not
-- give back automatically.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 011.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon,
-- after 009_add_order_delivery.sql.
--
-- ASCII only, comments included. See .claude/rules/database.md.
--
--
-- WHY THIS FILE EXISTS
--
-- There is one branch in the payment return that the schema had no honest state
-- for, and it is the worst branch in the product: the buyer paid, and between
-- their order being written and their payment being verified, the painting was
-- sold to somebody else. Every painting is a one-off, so there is nothing to
-- ship. The charge, however, has already happened.
--
-- Two things can be done about that, and which one happened is a fact the order
-- has to carry:
--
--   1. The transaction is voided the same day, before settlement. The order
--      becomes 'cancelled' and carries cancelled_at. That state already exists,
--      and 007 deliberately left 'cancelled' free to carry paid_at as well -
--      its note calls out authorization and capture being documented separately
--      as exactly the reason. This is that reason arriving.
--
--   2. Voiding is not possible - a different day, or the provider refuses. Then
--      money is held that must be given back by hand, and NOTHING in this
--      schema could say so. That is what this file adds.
--
--
-- WHY NOT A NEW STATUS
--
-- 'refund_due' as a seventh status was the obvious move and it is wrong twice.
--
-- The order IS paid: money moved, the provider has it, and the tax record needs
-- that. A status saying otherwise would be a second, competing answer to "did
-- this transaction happen". And 007 requires paid_at for 'refunded', so an
-- order that never passed through paid could never be marked refunded later
-- without inventing a payment date - which is precisely the loss 007 exists to
-- prevent.
--
-- So the status stays 'paid', which is true, and this column says what is owed
-- on top of it. When the refund is made by hand the order moves to 'refunded'
-- in the ordinary way, with refunded_at, and this column stops being the open
-- item. It is deliberately NOT cleared at that point: it records that the
-- refund was owed rather than chosen, which is a different fact from the refund
-- having happened, and the two together are the whole story.
--
--
-- WHY IT IS A TIMESTAMP AND NOT A BOOLEAN
--
-- The same reasoning as published_at. "A refund is owed" is worth less than
-- "a refund has been owed since Tuesday": the admin's orders list has to sort
-- these to the top, and an owed refund that has sat for a week is a different
-- problem from one raised four minutes ago. A boolean cannot say that, and
-- created_at cannot either - the order may have been placed long before.


begin;


-- ------------------------------------------------------------------ --
-- The column
--
-- Nullable, and null on every order that is behaving normally. It is set only
-- by the payment return, and only on the branch where a charge could not be
-- undone.
-- ------------------------------------------------------------------ --
alter table orders add column refund_due_at timestamptz;


-- ------------------------------------------------------------------ --
-- What it may not say
--
-- A refund can only be owed on money that was taken, so this requires paid_at.
--
-- That single rule also keeps it away from a pending order without naming one:
-- orders_pending_has_no_dates already forbids paid_at on 'pending', so a
-- pending order cannot satisfy this constraint and therefore cannot carry a
-- refund_due_at either. The two compose, which is why this file does not extend
-- that constraint - 007's is about the five dates it named, and widening it
-- here would mean two files owning one rule.
-- ------------------------------------------------------------------ --
alter table orders add constraint orders_refund_due_requires_paid_at
  check (refund_due_at is null or paid_at is not null);


-- ------------------------------------------------------------------ --
-- And it cannot precede the payment it is owed against.
--
-- Cheap, and it catches the transposition that would otherwise produce an
-- entirely plausible-looking row nobody would query.
-- ------------------------------------------------------------------ --
alter table orders add constraint orders_paid_before_refund_due
  check (paid_at is null or refund_due_at is null or paid_at <= refund_due_at);


commit;


-- ------------------------------------------------------------------ --
-- A PARTIAL INDEX, and the first one on this table that is not about listing
--
-- Unlike 009, this one earns its place. The admin's orders list has to surface
-- owed refunds however old they are and however many orders sit in front of
-- them, and that is a question about the few rows where this is set rather than
-- a filter across the whole table. A partial index is the shape of that
-- question.
-- ------------------------------------------------------------------ --
create index orders_refund_due_idx
  on orders (refund_due_at) where refund_due_at is not null;


-- ------------------------------------------------------------------ --
-- APPLYING THIS
--
-- Paste the whole file. The begin/commit covers the two alters; the index is
-- created afterwards and is safe to re-run only by dropping it first.
--
-- The column is nullable with no default, so it validates against every
-- existing row whatever the table holds.
-- ------------------------------------------------------------------ --
