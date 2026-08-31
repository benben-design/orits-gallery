# Data Layer

Painting data lives in a local file today. The schema for Postgres exists — see
database.md — but **no application code reads it yet**. The whole point of this
layer is that switching over costs one file.

## The rule

`lib/data/works-repository.js` is the **only** module that pages, layouts and
components may import for painting data.

`lib/data/artworks.js` is storage. Nothing outside `lib/data` may import it —
with one deliberate exception noted below. If you find yourself importing it
from a page, stop: the function you need belongs in the repository.

## What `lib/data/artworks.js` is for now

**It does not disappear when the database arrives.** That was the original plan
and it is no longer true.

`scripts/seed-local-database.mjs` reads it — through `readAllRecords()` — to
fill a local database with the sixteen works. So the file's role changes rather
than ending: it stops being what the site reads and becomes **the seed fixture
for local development**. It is the one file outside `lib/data` allowed to import
it, and it is a script rather than anything the site serves.

Two consequences worth knowing before editing that file:

- **It must stay importable from plain Node**, not only through Next's bundler.
  Its JSON import therefore carries an import attribute
  (`with { type: 'json' }`); without it, `node` refuses the module with
  `ERR_IMPORT_ATTRIBUTE_MISSING` and the seed script has no data source.
- Its records are still the source of the real titles, slugs, categories and
  statuses. Changing one changes what a re-seeded local database contains.

## What the repository looks like

Functions are named in product terms, not storage terms: the works on show, the
work at this slug, the most recent works, the featured work. Two properties keep
the promise that swapping the backend is invisible:

1. **Every function is async**, even while the implementation is synchronous.
   Callers already `await`, so real I/O later changes nothing for them.
2. **Every function returns plain serializable objects.** Never class instances,
   never a database row leaked as-is.

Both properties apply to functions you add. A new synchronous export is a
regression.

## The work record, as the repository returns it today

| Field | Notes |
|---|---|
| `id` | Stable string. In this file it doubles as the English slug and the image filename stem |
| `slug` | Per locale — `{ he, en }`. See i18n.md |
| `title` | Per locale |
| `description` | Per locale |
| `medium` | Per locale, and free text |
| `dimensions` | `{ width, height, unit }` — physical size of the painting |
| `price` | `{ amount, currency }` — `amount` is **whole shekels** |
| `year` | |
| `category` | `landscape` \| `still-life` |
| `status` | `available` \| `reserved` \| `sold` \| `not-for-sale` |
| `images` | Ordered collection; each has a type: `main`, `detail`, `in-situ` |
| `featured` | Marks the homepage hero work |
| `addedAt` | What "most recent" orders by |
| `hasPlaceholderData` | True while the stand-in values below are still in place |

`WORK_STATUSES`, `WORK_CATEGORIES` and `IMAGE_TYPES` are exported constants.
Use them; never retype the string literals in a component.

## Where this record and the database disagree

The schema was derived from this record, but four things are deliberately
different, and each is a real trap for whoever writes the swap.

**Money units.** The database stores `price_agorot` — a whole number of **minor
units**. This file holds `price.amount` in **whole shekels**, because
`lib/format.js` renders it with `maximumFractionDigits: 0`. A hundredfold
difference that both sides render as a plausible integer.

> The conversion belongs in the repository, in one place, at the moment rows
> become work objects — and nowhere else. Not in a component, not in
> `lib/format.js`, not at each call site. `scripts/seed-local-database.mjs` has
> the other direction (`toAgorot`) and is the reference for the shape of it.

Get it wrong and a ₪999 painting is offered for ₪99,900. Nothing in either
layer will complain.

**The identifier.** Here, one string is the id, the English slug and the image
filename stem. In the database it is none of those: the key is a generated uuid
with no meaning outside the database, and each slug is its own column. So
`getWorkById` changes meaning across the swap, and `/admin/works/[id]` currently
addresses works by the old string. **Nothing may derive an image path from a
work's id** once the swap happens.

**Publication.** This file has no notion of a draft: every record is visible.
The database has `published_at`, where null means a draft that the public site
must not show. Public reads therefore gain a filter that has no equivalent here,
and forgetting it publishes drafts.

**Medium.** Here it is free text per locale, and its placeholder is
`[PLACEHOLDER] Medium not recorded yet`. In the database it is a closed set of
two keys — `oil-on-canvas`, `pastel-on-paper` — translated in the application,
and **optional**. There is no key meaning "not recorded yet", so the seeded
works carry no medium at all rather than a fake one, and the placeholder string
has nowhere to go. See i18n.md: those two keys still need entries in both locale
files.

The database also carries two fields this record has no equivalent for at all:
`price_reduced_agorot` and `sale_channel`.

## Placeholder data

Dimensions, prices, descriptions, media and years are **not known yet**. The
stand-in values are deliberately absurd — 999x999 cm, 99,999 shekels, year 1000,
and copy prefixed `[PLACEHOLDER]` in English and `[טקסט זמני]` or `[ממלא מקום]`
in Hebrew — precisely so they cannot be mistaken for real data or ship by
accident. Titles, categories, slugs and images are real; everything else is
knowingly fake until the artist supplies it.

Do not "tidy" them into plausible-looking values.

## Adding data access

When a page needs data the repository does not expose, add a function to the
repository rather than filtering in the component. The component should ask for
what it wants — "the available still lifes" — not fetch everything and sift.
