-- 003_create_orders_tables.sql
--
-- Creates orders and order_lines: what someone bought, and what they paid.
--
-- Forward-only. Once this file has been applied it is never renamed,
-- renumbered or edited. Anything wrong here is corrected by 004.
--
-- Run by hand in pgAdmin, against local Postgres first and later against Neon,
-- after 001_create_works_table.sql - order_lines references works(id).
--
-- The rule behind most of this file: an order is a historical record. It says
-- what was true at the moment money moved, and nothing that happens to the
-- catalogue afterwards may change what it says. A painting can be re-priced,
-- re-photographed or renamed; the order it was sold in must read the same in
-- three years, in front of an accountant.

-- ------------------------------------------------------------------ --
-- orders
-- ------------------------------------------------------------------ --
create table orders (
  id uuid primary key default gen_random_uuid(),

  -- No default, deliberately. An insert that forgets to say what state the
  -- order is in fails outright rather than being guessed at - there is no
  -- state safe enough to assume, and a wrong guess here is a wrong answer
  -- about money.
  status text not null check (status in ('pending', 'paid', 'shipped', 'cancelled', 'refunded')),

  -- The payment provider's identifier for this transaction. Null until there
  -- is one: a pending order has not been paid for, and an empty string would
  -- be indistinguishable from a payment whose reference failed to record.
  --
  -- Unique when present, enforced by the index at the foot of this file. That
  -- uniqueness is not tidiness - payment webhooks retry, and a provider will
  -- happily deliver the same event twice. The database refusing the second one
  -- is the last line of defence against one payment being processed twice.
  payment_reference text,

  -- Buyer contact. All three required: an Israeli courier delivery without a
  -- phone number is a parcel that comes back, and the email is how the order
  -- confirmation and the tax invoice reach the buyer.
  --
  -- No format check on the email. A regex in the database is a well-known way
  -- to reject somebody's perfectly valid address at the worst possible moment;
  -- validation belongs at the boundary, where the error can be shown in the
  -- language the buyer is reading.
  buyer_name  text not null,
  buyer_email text not null,
  buyer_phone text not null,

  -- Held as written, as one field. Enough to ship a painting and to print on
  -- an invoice. If a courier integration later needs street, city and postal
  -- code apart, that is a migration to split it - and a decision better made
  -- against a real provider's API than guessed at now.
  shipping_address text not null,

  -- Agorot, matching works.price_agorot. Integer, never a float: money that
  -- rounds differently in two places is money that goes missing.
  --
  -- A snapshot of what was charged, computed by the server from its own
  -- records at payment time. Never a figure supplied by the browser, and never
  -- recalculated afterwards from current prices - that is precisely what an
  -- order must not do.
  --
  -- Not constrained to equal the sum of its lines. That would need a trigger,
  -- and a trigger firing mid-checkout is a way to fail a payment that has
  -- already gone through. Keeping the two in step is the checkout's job.
  total_agorot integer not null check (total_agorot >= 0),

  -- One currency per order, governing every line beneath it. Deliberately not
  -- repeated on order_lines: two places to state a currency is two places to
  -- disagree, and a line priced in a different currency from its own order is
  -- a bug nobody would think to look for.
  currency char(3) not null default 'ILS',

  created_at timestamptz not null default now(),

  -- No trigger. The application sets this on every write, or it silently stays
  -- at insert time.
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ --
-- order_lines
--
-- One row per painting in an order.
--
-- There is NO quantity column, and adding one would be a bug rather than a
-- feature. Every painting is a one-off: there is no stock of two, nothing to
-- restock, and "2 x Lemons" is not a thing that can be sold. One record, one
-- object, one buyer.
-- ------------------------------------------------------------------ --
create table order_lines (
  id uuid primary key default gen_random_uuid(),

  -- An order line without its order is meaningless, so it goes when the order
  -- goes. In practice orders are not deleted - they are cancelled or refunded,
  -- which are statuses rather than deletions, because a sale that happened is
  -- a record the business has to keep.
  order_id uuid not null references orders (id) on delete cascade,

  -- RESTRICT, and this is the referential behaviour the whole table turns on.
  --
  -- Deleting a work that has been ordered is refused outright by the database.
  -- The alternatives are both worse:
  --
  --   CASCADE would delete the line, silently shrinking a paid order. The
  --   buyer's record of what they bought would vanish, and the order total
  --   would stop matching its own contents.
  --
  --   SET NULL would keep the line but forget which painting it was, leaving
  --   an order that says money was taken for something unidentifiable. That is
  --   useless to the buyer, to customer service, and to a tax inspector.
  --
  -- RESTRICT means a sold painting stays in the catalogue permanently, which
  -- is the right outcome anyway: it is part of the body of work and evidence of
  -- demand, it stays on display with its price struck through, and Israeli
  -- record-keeping expects the sale to remain traceable. If the artist wants it
  -- out of sight, that is published_at going null - a visibility change, not a
  -- deletion.
  --
  -- The admin has to catch this and explain it in plain Hebrew. A raw
  -- foreign-key violation reaching the artist is a phone call to her son.
  work_id uuid not null references works (id) on delete restrict,

  -- Copied, never joined to. The price actually charged for this painting at
  -- the moment of purchase, in the order's currency.
  --
  -- Reading it back off works.price_agorot would be wrong twice over: the
  -- artist re-prices work, and a discounted sale was charged at
  -- works.price_reduced_agorot rather than the regular price. Neither of those
  -- may retroactively rewrite what a buyer paid. This column is the only
  -- honest answer to "what did this cost", and it stays right long after the
  -- painting's own price has moved on.
  price_agorot integer not null check (price_agorot >= 0),

  created_at timestamptz not null default now(),

  -- The same painting cannot appear twice in one order. It is a single
  -- physical object - a second line for it is a cart or data-entry bug, and
  -- with no quantity column this is also the only way that bug could express
  -- itself.
  constraint order_lines_one_work_per_order unique (order_id, work_id)
);

-- NOT requested in the brief - say the word and it comes out before you apply
-- this. Unique only where a reference exists, so any number of orders may sit
-- unpaid with no reference at all, while a provider replaying the same payment
-- event a second time hits a wall. See the note on payment_reference above.
create unique index orders_payment_reference_idx
  on orders (payment_reference) where payment_reference is not null;

-- The admin's orders list: newest first.
create index orders_created_at_idx on orders (created_at desc);

-- Filtering that list by state - the unpaid ones, the ones still to ship.
create index orders_status_idx on orders (status);

-- Answers "which order sold this painting", and it is also what stops the
-- RESTRICT check above from scanning the whole table on every work deletion.
create index order_lines_work_idx on order_lines (work_id);
