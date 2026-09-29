# Database

PostgreSQL, and **there are two databases now.** Development runs against a
**local Postgres**, created by hand in pgAdmin and called `art_studio`.
Production is a **Neon project named "Orit's gallery"** — region US East
(Ohio), PostgreSQL 18 — carrying migrations 001 through 012 (011 and 012 since 28-09-2026) and both admin
accounts as of 12-09-2026.

The schema is plain SQL in `database/migrations/`, and **the application reads
it**: every page goes through `lib/data/works-repository.js`, which queries
Postgres through `lib/db.js`. `lib/data/artworks.js` is now the seed fixture
rather than storage. See data-layer.md.

**A database being ready is not the same as the site being live.** Nothing is
deployed, so `DATABASE_URL` is set on no host and nothing points at Neon but a
developer's own shell. See deployment.md.

**Two endpoints, and which one is used is not a preference.** The deployed
application reads the **pooled** endpoint; migrations and scripts use the
**direct** one, which is the same host without `-pooler`. The reason is
connection count: serverless hosting runs many short-lived instances and each
holds a pool of its own, which is how a small Postgres runs out of connections
while sitting almost idle. A migration is one connection doing one job and has
no business going through a pooler.

## Migration conventions

These apply to every migration from here on.

- **Plain SQL, applied by hand** — pasted into pgAdmin, or run with `psql -f`.
  There is no migration runner and no ORM, deliberately.
- **Filenames start with a zero-padded sequence number** giving execution order,
  then a short description of what the file does:
  `003_create_orders_tables.sql`.
- **Forward-only.** Once a file has been applied it is never renamed,
  renumbered or edited. A mistake is corrected by the next numbered file — a
  rename reads as a brand-new migration and runs twice. **Every file here has
  now been applied somewhere**, so this covers all ten rather than most of
  them: 008 in particular is frozen, and a refreshed catalogue is a new
  numbered file, never an edit to that one.
- **Every migration from here is applied twice** — to the local database and to
  Neon — deliberately, and as a step of deploying rather than as an
  afterthought. Applying one locally does nothing to production.
- **ASCII only, comments included** — with exactly one exception, migration
  008, which loads the catalogue and whose *data* is Hebrew by definition. Its
  comments are still ASCII and its header says how to run it. The rule is about
  SQL text read from a file, so a file whose contents are Hebrew data has to
  carry the encoding instruction instead of pretending the problem is gone. `psql` on Windows defaults its client
  encoding to WIN1252, and a single character with no WIN1252 equivalent aborts
  the statement it sits inside. One Hebrew character in a comment took out an
  entire `create table` and then cascaded into three misleading
  "relation does not exist" errors. Hebrew is fine as *data* — the driver
  negotiates UTF-8 — so this is only about SQL text read from a file.
  `$env:PGCLIENTENCODING = "UTF8"` fixes it per shell; ASCII files need no
  setup at all.
- `gen_random_uuid()` needs PostgreSQL 13 or newer, where it is core.
- **Which migrations a given database has had applied is not recorded here.**
  There is no ledger table. Ask the database — that is the only answer that
  cannot be stale, **and there are two to ask now.**

## The schema

### `works` — one row per painting

| Column | Notes |
|---|---|
| `id` | `uuid`, `gen_random_uuid()`. **An independent generated identifier** |
| `slug_he`, `slug_en` | Both `unique`. Public and permanent once live |
| `title_he`, `title_en` | Required in both languages |
| `description_he`, `description_en` | Optional. Null means not written yet |
| `medium` | **Optional**, and a closed set: `oil-on-canvas`, `pastel-on-paper` |
| `width_cm`, `height_cm` | `numeric(6,1)`, required, `> 0`. The physical canvas |
| `price_agorot` | Required integer, **minor units** |
| `price_reduced_agorot` | Optional. Must be *below* `price_agorot` |
| `price_currency` | `char(3)`, default `ILS` |
| `year` | Optional, and deliberately unconstrained by range |
| `category` | Required: `landscape`, `still-life` |
| `status` | Required, **no default**: the four sale statuses |
| `sale_channel` | Optional: `this-site`, `under1000`, `elsewhere` |
| `published_at` | `timestamptz`, **nullable — null means draft** |
| `featured` | Boolean. At most one row may be true |
| `has_placeholder_data` | Boolean, defaults true |
| `added_at` | `date`, required. What "most recent" orders by |
| `created_at`, `updated_at` | No trigger — the application sets `updated_at` |

Four things about this table are easy to get wrong:

**`id` is not the slug and not the filename.** In `lib/data/artworks.js` one
string does all three jobs. In the database it does not: the key is a uuid with
no meaning outside the database, and the slug per language is its own column.
Nothing may derive an image path from a work's id. Today `slug_en` happens to
match the filename stems in `public/paintings`, and that coincidence is the only
bridge between the two — it is not a rule to build on.

**`published_at` is a separate axis from `status`.** Null means a draft: the
work exists in the admin and is not visible on the public site. A draft may
hold **any** of the four sale statuses — a work can be sold and unpublished, or
available and unpublished. So a sale status alone never determines visibility,
and public reads must filter on `published_at is not null` as well. It is a
timestamp rather than a boolean because "when did this go live" is worth
keeping, and it has no default so that any future automated import lands as a
draft without having to remember to.

**`price_reduced_agorot` is a price, never a status.** A discounted work is
still `available`. The constraint `works_reduced_price_below_price` enforces
that a discount actually undercuts the regular price, and null means no
discount — not zero, which would be a free painting.

**At most one work may be `featured`, and the database enforces it.** A unique
index over a constant expression, restricted to featured rows
(`works_single_featured`). Zero featured works is allowed; the repository falls
back to the most recent. The consequence is operational: **changing which work
is featured must clear the previous one in the same transaction.** Setting the
new flag first fails on the index. `scripts/seed-local-database.mjs` does this
correctly and is the reference.

### `work_images` — several rows per painting

| Column | Notes |
|---|---|
| `id` | `uuid` |
| `work_id` | References `works(id)` **on delete cascade** |
| `image_ref` | The image. A local path today, a hosted identifier later |
| `pixel_width`, `pixel_height` | Required, `> 0`. Pixels of the *file* |
| `type` | Required: `main`, `detail`, `in-situ` |
| `position` | Required, `>= 0`. Explicit ordering, not insertion order |
| `alt_he`, `alt_en` | Optional. Null means derive from the work's title |
| `created_at` | |

- **At most one `main` image per work**, enforced by `work_images_one_main`.
  `detail` and `in-situ` may repeat freely — that is the point of having them.
- **`position` is not unique.** Two images may share one. Ambiguous ordering is
  not corrupt ordering, and reads settle it by ordering on `position` then `id`.
- `image_ref` is named neither `path` nor `url` nor `public_id` on purpose, so
  that the move to image hosting is a change of value and not a migration.
- **`pixel_width`/`pixel_height` are not the same quantity as `works.width_cm`
  and `works.height_cm`** — pixels of a file versus centimetres of a canvas, in
  different tables. The naming is what keeps them apart. On which of these and
  the generated manifest is authoritative, see images.md.

### `orders` and `order_lines`

An order is a historical record: it says what was true when money moved, and
nothing that later happens to the catalogue may change what it says.

`orders` carries `status` (`pending`, `paid`, `shipped`, `delivered`,
`cancelled`, `refunded`, required with no default), an optional
`payment_reference` that is unique where present, required `buyer_name` /
`buyer_email` / `buyer_phone`, a **conditionally** required `shipping_address`
as a single text field, `total_agorot`, `currency`, a required `buyer_locale`, a
required `delivery_method` and `delivery_fee_agorot`, the five dates below, and
`created_at` / `updated_at`.

**Delivery, added by migration 009.** `delivery_method` is a closed set of two —
`shipping` or `self-pickup` — required and with **no default**, for the same
reason `status` has none: a default of `shipping` silently charges and demands an
address, a default of `self-pickup` silently waives the fee.

- **`delivery_fee_agorot` is what was charged, not what we charge.** Required,
  minor units, written once at checkout and never recomputed. The rate lives in
  one place — `site_settings.shipping_fee_agorot` (migration 011), edited at
  `/admin/settings` — and the column exists precisely so that changing it cannot
  rewrite what an old order cost. It is a *component* of `total_agorot`, and
  nothing enforces that arithmetic, for the reason 003 gave about line prices.
- **A pickup order is free and the database enforces it** (`orders_pickup_is_free`).
  The shipping fee is deliberately **not** pinned to 4000: that would put today's
  price list in the schema, fail an old order's own constraint the day the rate
  moved, and refuse a free-shipping promotion. Enforce what is never legitimately
  otherwise; stay silent where the business may change its mind.
- **`shipping_address` lost its `not null`**, replaced by two conditional rules —
  required for `shipping`, and **absent** for `self-pickup`. Two constraints
  rather than one so a violation names which half broke. A pickup order has no
  address, and a `not null` column is what forces somebody to invent one; an
  invented address on an order is worse than an absent one, because it looks
  like a fact. There is deliberately no non-blank check — an empty string was
  already accepted before, and format validation belongs at the boundary.
- **A pickup order never ships, and 009 corrects 007 for it.** It goes from
  `paid` straight to `delivered` in one act when the artist hands the painting
  over. So `shipped` still requires `shipped_at`; `delivered` requires it **only
  when the method is shipping**; and a pickup order may neither hold that status
  nor carry that date at all (`orders_pickup_never_ships`), because the
  alternative is inventing a dispatch date nobody observed — on the columns 007
  exists to keep honest. The law counts the window from receipt, and a pickup
  order has a real `delivered_at`.
- **009 also closes a hole that relaxation opens.** 007 ordered the chain as
  `paid_at <= shipped_at <= delivered_at`, and both halves are silent when
  `shipped_at` is null — so with no dispatch date, a receipt dated before its own
  payment would pass every constraint in 007. `orders_paid_before_delivered`
  states `paid_at <= delivered_at` directly. Redundant for a shipping order, and
  load-bearing for a pickup one.

**`refund_due_at`, added by migration 010**, is the one state the payment return
had nowhere to put: a buyer paid, another buyer got the painting first, and the
charge could not be voided. The order stays `paid` — money moved, and the tax
record needs that — and this column says a refund is owed on top of it. It is not
a seventh status for two reasons: the order genuinely is paid, and 007 requires
`paid_at` before `refunded`, so an order that never passed through paid could
never later be marked refunded without inventing a payment date. Constrained to
require `paid_at`, which also keeps it off a pending order without naming one.

`paid_at`, `shipped_at`, `delivered_at`, `cancelled_at` and `refunded_at` are
all nullable, each absent until the thing it records has happened. Which of
them must be present is a question about the status, and migration 007 answers
it in constraints rather than in `not null` — a `not null` would make a pending
order unstorable.

`order_lines` carries `order_id` (**cascade**), `work_id` (**restrict**), and
`price_agorot`.

- **There is no quantity column, and adding one would be a bug.** Every
  painting is a one-off; "2 x Lemons" is not a thing that can be sold.
- **The same work cannot appear twice in one order** —
  `order_lines_one_work_per_order`.
- **A work that has been ordered cannot be deleted.** `on delete restrict`, so
  the database refuses. `cascade` would silently shrink a paid order until its
  total stopped matching its contents; `set null` would keep a line that has
  forgotten which painting was sold. A sold painting therefore stays in the
  catalogue permanently, which is the right answer anyway — if the artist wants
  it out of sight, that is `published_at` going null, a visibility change rather
  than a deletion. **The admin must catch this and explain it in Hebrew**; a raw
  foreign-key error reaching the artist is a phone call to her son.
- **`order_lines.price_agorot` is copied at the moment of purchase, never
  joined to.** Prices change, and a discounted sale was charged at the reduced
  price. Neither may retroactively rewrite what a buyer paid.
- **`buyer_locale` records the language the buyer was reading.** Required, and
  constrained to the locales in `lib/i18n/config.js`. The confirmation and the
  tax invoice have to arrive in that language, and it cannot be reconstructed
  after the fact — it is not the site default, and an Israeli address says
  nothing about which language someone reads. See i18n.md for what this costs.
- `payment_reference` is unique where present because a completion signal can
  arrive more than once — a webhook retrying on a provider that has one, or, on
  this one, a buyer reloading the return URL or pressing back onto it. That
  index is the last defence against a single payment being processed twice, and
  it is what makes recording a payment idempotent rather than merely careful.
- **`delivered` is a status, not only a date, and that is what makes the 14-day
  cancellation window computable.** Israeli law counts the window from
  *receipt*, and dispatch is not receipt — computing it from `shipped_at` would
  close the window earlier than the law does, which is the direction that
  shortens the buyer's rights. It also gives `shipped` somewhere to resolve to:
  with `shipped` terminal, "which orders are still on the way" accumulates
  everything ever sent and stops being read.
- **Each status carries the date it happened, and the database enforces the
  pair — but only forwards.** Migration 007 requires `paid_at` for every status
  at or past paid (**`refunded` included**: a refund does not erase the payment
  that preceded it), `shipped_at` for `shipped` and — since 009 — for
  `delivered` only when the method is shipping, `delivered_at`
  for `delivered`, `cancelled_at` for `cancelled`, `refunded_at` for
  `refunded`, and all five absent for `pending`. Ordering is enforced too:
  `paid_at <= shipped_at <= delivered_at`.
- **Two things are deliberately *not* constrained**, and both are exits rather
  than steps in the chain. Whether a `cancelled` order carries a `paid_at` —
  the payment provider documents authorization separately from capture, so an
  order authorised and then voided before capture is a real state, and forcing
  it to be a refund would be the constraint fighting the provider — Hyp Pay
  documents exactly that split (J5 authorize, J4 capture), though we charge
  directly with J2 today, so the state does not arise yet and the silence is
  kept for the day it might. And whether
  a `refunded` order carries `shipped_at` / `delivered_at` — refunding before
  dispatch and after delivery are both legitimate, so a constraint picking one
  would be wrong half the time. The line 007 draws: **enforce what is
  unrecoverable if lost, stay silent where the provider may legitimately be
  right.**
- **This is the one place the schema ties a status to another column, and
  `works` deliberately does the opposite.** `works.sale_channel` is *not* tied
  to `status = 'sold'`, because it is typed by hand into a form the artist
  fills in any order, and a constraint firing on a half-filled form is one she
  fights. These dates are written by a verified payment return and by one
  deliberate click,
  never mid-edit, and a missing `paid_at` cannot be typed in later — the moment
  is gone and it decides a legal deadline. The two tables are not
  inconsistent; the difference is whether the loss is permanent, and 007's
  comment says so at length so neither is read as the house rule.
- **Known consequence, recorded rather than solved: an order whose receipt is
  never marked has no computable window.** Its status stays `shipped` and
  `delivered_at` stays null, indistinguishable from a parcel still in transit.
  No constraint can make somebody confirm a delivery, and a default would
  invent a date nobody observed — which would be believed and counted from. The
  remedy belongs to the admin's orders list, surfacing dispatches never closed —
  and it is **built**: an order still `shipped` with no receipt seven days after
  dispatch is flagged there, with the reason and what to do about it.

### `admin_users`

`id`, `email`, `password_hash`, `created_at`, `updated_at`.

- **Two accounts, the artist's and the developer's, with equal rights.** Nothing
  in the table assumes a single row.
- **No role column.** There is no second kind of admin, and a column that only
  ever holds one value teaches a future reader something untrue. The
  consequence is that either account can change or delete the other.
- **Uniqueness is case-insensitive**, via a unique index on `lower(email)`.
  Lookups must therefore match `where lower(email) = lower($1)` or they will
  not use it. A login that fails on capitalisation is indistinguishable from a
  forgotten password, and it is also how two rows for one person appear.
- **Only a hash is ever stored.** There is no plaintext column and adding one is
  not a shortcut worth taking. Hashing happens in the application, never in
  SQL — a password passed to a database function is a password in the query log.
- **No password-reset columns**, deliberately: that mechanism has not been
  designed, and guessing at the columns would fix the shape of a flow nobody
  has thought through. No last-login column either.
- **Failed attempts are counted, but not here.** 004 deferred that until there
  was a policy to enforce; migration 006 is the policy, and it puts the counter
  in its own table rather than in columns on this one. That is not a detail:
  columns here could only count attempts against addresses that have accounts,
  and that difference in behaviour would leak which addresses do. See
  `admin_login_attempts` below.

### `admin_login_attempts`

The counter behind the sign-in rate limit. Added by migration 006, which is the
policy that 004 deferred.

`id`, `email_lower` (nullable), `ip` (nullable since 012), `failures`,
`blocked_until`, `first_failure_at`, `last_failure_at`.

- **A row is one counter, and which counter depends on which half is null.**
  Both set: one address from one source — the tight limit. `email_lower` null:
  one source across every address it has tried — the looser ceiling. **`ip`
  null (migration 012): one address across every source** — the ceiling that
  keeps counting when the source is rotated or forged, 20 in 60 minutes. Both
  null is refused (`admin_login_attempts_keyed`). All three are checked on every
  attempt and the strictest block wins; a successful sign-in clears all three
  for the address it proved. `admin_login_attempts_address` is its partial unique
  index, for the same reason as the other two.
- **It is keyed on the pair, not on either half.** Address alone would let any
  stranger lock the artist out of her own account; source alone is defeated by
  rotating addresses.
- **It references nothing.** There is deliberately no foreign key to
  `admin_users`, because attempts are counted against the address that was
  *typed*, whether or not an account exists. A foreign key would make that
  impossible and would leak which addresses are real.
- **Two partial unique indexes, not one composite.** In a plain unique index
  NULLs are distinct from one another, so every source-wide row for one IP would
  be allowed to exist repeatedly and the looser ceiling would silently never
  accumulate. `admin_login_attempts_pair` covers the non-null case and
  `admin_login_attempts_source` the null one, and the upserts conflict against
  them by repeating each predicate.
- **No thresholds or delays live here.** They are constants in
  `lib/auth/login-throttle.js`, because a policy you have to write a migration
  to tune is a policy nobody tunes.
- **The table is pruned by the application**, on each recorded failure, in the
  same round trip: rows that are both unblocked and quiet for an hour are
  deleted. There is no cron on this project, and a cleanup that runs exactly
  when the table is growing is the right shape.
- `ip` is text rather than `inet`: it arrives from a proxy header, it may be v4
  or v6, and a value that fails to parse must still be countable rather than
  raising mid-login.

### `checkout_attempts`

The counter behind the checkout rate limit. Added by migration 013 — **written,
and not yet applied to either database** until it is run by hand.

`id`, `ip` (text, 1 to 64 characters), `created_at`, with an index on
`(ip, created_at)`.

- **A row is one order slot a source has used**, not a counter: "how many in
  the last hour" is a count over a sliding window. A slot is taken before the
  order is written and deleted again if no order was written.
- **Its own table**, independent of `admin_login_attempts`: different things
  counted, different pruning, different code.
- **References nothing, and holds no limit or window** — those are constants in
  `lib/checkout/checkout-throttle.js`.
- **`ip` is personal data.** The application deletes every row older than the
  window on each checkout. With no scheduler, a row can outlast the window
  until the next checkout — see security.md.

### `site_settings` — one row, the studio's own facts

Added by migration 011. The About text (`about_he`, `about_en`), `email`,
`phone`, `whatsapp_number`, `instagram_url`, `facebook_url`,
`shipping_fee_agorot`, `self_pickup_offered`, the portrait
(`portrait_image_ref`, `portrait_pixel_width`, `portrait_pixel_height`) and
`updated_at`.

- **One row with a typed column per field, never key-value.** The list is closed
  and small, and as columns the database enforces each one's type. Adding a
  setting is a migration, which is the right price at this size.
- **A second row is impossible.** The key is `id boolean primary key default
  true check (id)` — it has exactly one legal value. **Deleting the row is not
  prevented**, deliberately: the application never deletes it, and its read must
  fail loudly and name 011 rather than fall back to defaults.
- **"Not provided" is `null` and only `null`.** Every text column refuses a
  value that is blank once trimmed, so a caller has one thing to check.
- **The About text is both languages or neither**
  (`site_settings_about_both_languages`). The approval gate is form state, so
  the database cannot know the English was approved — but it can refuse a
  Hebrew text with no English at all, which is the half that stops the gate
  being stepped around.
- **`whatsapp_number` is the wa.me form** — digits only, country code first, no
  leading zero — because it becomes a link, not text. `instagram_url` and
  `facebook_url` must start `https://`, because each becomes an `href` on every
  public page. Email and phone are unchecked, as everywhere else here.
- **`shipping_fee_agorot` is what checkout would charge now**, never what an old
  order was charged — that is `orders.delivery_fee_agorot`, and it is why this
  one may be edited. Zero is allowed (a promotion). Neither it nor
  `self_pickup_offered` has a default: a default rate is a price nobody chose.
- **The portrait is stored the way `work_images` stores a painting**, and is all
  three columns or none. No alt columns: the alt derives from the artist's name
  in the locale files.

## Rules

- Prices are stored as an **integer number of minor units** — agorot — plus a
  currency code. Never a float, never a formatted string. `lib/data/artworks.js`
  and `lib/format.js` still work in whole shekels, so a conversion is required
  at the boundary; see data-layer.md, and get it right, because the failure mode
  is a price rendered a hundred times too large.
- Every query is parameterized. Never interpolate input into SQL.
- Migrations follow the conventions at the top of this file.
- Slugs are unique per language and permanent once published. See seo.md.
- Schema changes are applied to **both databases** explicitly as part of
  deploying, not assumed to have happened.
- Constrained sets — the four statuses, the two categories, the two media keys,
  the order statuses, the sale channels, the locales — are enforced in the
  database and not only in application code. Adding a value is a migration.

## Not built

- ~~**Neon.**~~ **Connected**, since 12-09-2026. "Orit's gallery" carries 001
  through 010, the catalogue and both admin accounts. What is missing is
  everything around it: **nothing is deployed**, `DATABASE_URL` is set on no
  host, and the production `ADMIN_SESSION_SECRET` does not exist yet. See
  deployment.md.
- ~~**The admin route guard.**~~ **Built.** Every page under
  `app/(admin)/admin/(guarded)/` calls `requireAdminSession()` as its first
  statement, and `scripts/check-admin-guard.mjs` fails if one does not. See
  security.md. Whether a given database has any admin rows is still a question
  for that database rather than for this file.
- **The checkout, and therefore what actually writes `orders`.** The provider
  itself is settled — Hyp Pay, on the yaad-sarig platform — but nothing reads
  its credentials yet and no row has ever been written to either orders table.
  Note that 003 and 007 both describe payment state as arriving by webhook.
  Migrations are forward-only and are never edited, so those comments stay as
  written; they record what was believed when the schema was designed, and
  api.md is where the amended rule lives.
- **Image hosting is connected**, for the main image. `image_ref` now holds
  either kind: a local path under `public/paintings/` for the sixteen seeded
  works, or an absolute delivery URL for anything the artist uploaded. Nothing
  in the column distinguishes them and nothing should — that agnosticism is why
  swapping delivery was a change of value rather than a migration. The
  application tells them apart by the leading slash; see images.md.
