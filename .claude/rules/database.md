# Database

PostgreSQL. Development runs against a **local Postgres**, created by hand in
pgAdmin; the database is called `art_studio`. **Neon is the intended host for
production and is not connected yet.**

The schema is plain SQL in `database/migrations/`, and **the application reads
it**: every page goes through `lib/data/works-repository.js`, which queries
Postgres through `lib/db.js`. `lib/data/artworks.js` is now the seed fixture
rather than storage. See data-layer.md.

That is true of the **local** database only. Neon has nothing pointing at it, so
a deployed build has no database to read — which is a launch blocker, not a
working state. See deployment.md.

## Migration conventions

These apply to every migration from here on.

- **Plain SQL, applied by hand** — pasted into pgAdmin, or run with `psql -f`.
  There is no migration runner and no ORM, deliberately.
- **Filenames start with a zero-padded sequence number** giving execution order,
  then a short description of what the file does:
  `003_create_orders_tables.sql`.
- **Forward-only.** Once a file has been applied it is never renamed,
  renumbered or edited. A mistake is corrected by the next numbered file — a
  rename reads as a brand-new migration and runs twice.
- **ASCII only, comments included.** `psql` on Windows defaults its client
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
  cannot be stale.

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

`orders` carries `status` (`pending`, `paid`, `shipped`, `cancelled`,
`refunded`, required with no default), an optional `payment_reference` that is
unique where present, required `buyer_name` / `buyer_email` / `buyer_phone`, a
required `shipping_address` as a single text field, `total_agorot`, `currency`,
a required `buyer_locale`, and `created_at` / `updated_at`.

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
- `payment_reference` is unique where present because payment webhooks retry,
  and that index is the last defence against one payment being processed twice.
- **The 14-day cancellation window is not computable from this schema.** Only
  `created_at` and `updated_at` exist, so once status moves `paid -> shipped`
  the payment date is gone. Israeli law counts the window from receipt. This is
  a known gap, not a decision — it needs `paid_at` / `shipped_at` or a status
  history table before checkout is built.

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

`id`, `email_lower` (nullable), `ip`, `failures`, `blocked_until`,
`first_failure_at`, `last_failure_at`.

- **A row is one counter, and which counter depends on `email_lower`.** Set, it
  counts one address from one source — the tight limit. Null, it counts one
  source across every address it has tried — the looser ceiling. Both are
  checked on every attempt and the strictest block wins.
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

## Rules

- Prices are stored as an **integer number of minor units** — agorot — plus a
  currency code. Never a float, never a formatted string. `lib/data/artworks.js`
  and `lib/format.js` still work in whole shekels, so a conversion is required
  at the boundary; see data-layer.md, and get it right, because the failure mode
  is a price rendered a hundred times too large.
- Every query is parameterized. Never interpolate input into SQL.
- Migrations follow the conventions at the top of this file.
- Slugs are unique per language and permanent once published. See seo.md.
- Schema changes are applied to Neon explicitly as part of deploying, not
  assumed to have happened.
- Constrained sets — the four statuses, the two categories, the two media keys,
  the order statuses, the sale channels, the locales — are enforced in the
  database and not only in application code. Adding a value is a migration.

## Not built

- **Neon.** The local database is the only one that exists. Production has no
  database, and the migrations have never been applied to one — including 006,
  without which every admin sign-in errors rather than degrading quietly.
- **The admin route guard.** Signing in and out are built — a signed httpOnly
  cookie, no session table, see security.md — but nothing yet refuses an admin
  page to someone without a session. Whether a given database has any admin
  rows is a question for that database, not for this file.
- **The payment provider**, and therefore what actually writes `orders`.
- **Image hosting.** `image_ref` holds local paths today.
