# Database

Neon (PostgreSQL). **Not wired up yet.** `database/` exists with a `migrations/`
folder and nothing applied.

When it arrives, only `lib/data/works-repository.js` changes — see data-layer.md.
That is the whole point of the current indirection, and it is worth protecting.

## The shape to build

Derived from the work record already implemented in `lib/data/artworks.js`. Build
the schema from that, not from a fresh guess, so the swap is mechanical.

**Works.** One row per painting. Bilingual text fields are per-language columns
or a translations table — one painting is always one work row, never two.
Required: a stable id, a slug per language, title / description / medium per
language, physical dimensions, price amount and currency, year, category,
status, sale channel, a featured flag, and a created timestamp.

**Status** is a constrained set — `available`, `reserved`, `sold`,
`not-for-sale` — enforced in the database, not only in application code. A
boolean is wrong; see commerce.md.

**Category** is constrained to `landscape` and `still-life` today. It exists as a
field precisely so that collection pages can be added later without a migration.

**Images.** A separate table, several rows per work, each with a type (`main`,
`detail`, `in-situ`) and an explicit ordering position. Not a single image column
on the work — see images.md.

**Orders.** One order, one or more works, a status, a payment reference, buyer
contact and shipping details. Because every painting is unique, an order line is
a work, not a work plus a quantity.

**Admin user.** A single account for the artist.

## Rules

- Prices are stored as an integer amount plus a currency code. Never a float,
  never a formatted string.
- Every query is parameterized. Never interpolate input into SQL.
- Migrations are files under `database/migrations/`, applied in a recorded order,
  never renamed or reordered once applied — a rename reads as a brand-new
  migration and runs twice.
- Schema changes are applied to Neon explicitly as part of deploying, not assumed.
- Slugs are unique per language and permanent once published. See seo.md.
