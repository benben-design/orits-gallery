# Data Layer

**Painting data comes from Postgres.** `lib/data/works-repository.js` queries it
through `lib/db.js` — see database.md for the schema. The swap cost one file and
changed nothing above it: same function names, same arguments, same returned
shapes, which is what the indirection was for.

Development runs against a local Postgres. **Neon is not connected**, so nothing
deployed has a database behind it yet.

## The rule

`lib/data/works-repository.js` is the **only** module that pages, layouts and
components may import for painting data.

`lib/data/artworks.js` is **not storage any more** — it is the seed fixture, and
the home of the shared constants. Nothing outside `lib/data` may import it, with
one deliberate exception noted below. If you find yourself importing it from a
page, stop: the function you need belongs in the repository, and the data it
would give you is not what the site is serving.

## What `lib/data/artworks.js` is for now

**It did not disappear when the database arrived.** That was the original plan
and it is no longer true. It has two jobs left, and both are load-bearing —
deleting the file breaks the seed script *and* the running site.

1. **The seed fixture.** `scripts/seed-local-database.mjs` reads it through
   `readAllRecords()` to fill a local database with the sixteen works. That
   script is the one file outside `lib/data` allowed to import it, and it is a
   script rather than anything the site serves.
2. **The shared vocabulary.** `WORK_STATUSES`, `WORK_CATEGORIES` and
   `IMAGE_TYPES` are declared here, and the repository re-exports the first two
   so components can import them without reaching past the repository. Remove
   the file and `works-repository.js` fails to resolve its import — every page
   with it.

Three consequences worth knowing before editing that file:

- **It must stay importable from plain Node**, not only through Next's bundler.
  Its JSON import therefore carries an import attribute
  (`with { type: 'json' }`); without it, `node` refuses the module with
  `ERR_IMPORT_ATTRIBUTE_MISSING` and the seed script has no data source.
- Its records are still the source of the real titles, slugs, categories and
  statuses. Changing one changes what a **re-seeded** local database contains —
  and nothing else. The site reads the database, so an edit here is invisible
  until `npm run seed:local` runs again.
- Its own header comment still describes it as storage that disappears when the
  database arrives. That is stale, and it is the file's own docblock rather than
  a rules file — worth correcting next time the file is touched for another
  reason.

## What the repository looks like

Functions are named in product terms, not storage terms: the works on show, the
work at this slug, the most recent works, the featured work. Two properties kept
the promise that swapping the backend was invisible, and they were what made the
swap a one-file change:

1. **Every function is async.** It always was, deliberately, back when the
   implementation was synchronous — so callers already `await`, and real I/O
   arriving changed nothing for them.
2. **Every function returns plain serializable objects.** Never class instances,
   never a database row leaked as-is. The mapping from row to work object
   happens inside the repository.

Both properties apply to functions you add. A new synchronous export is a
regression, and so is returning a `pg` row.

A third property arrived with the database. **Every read states its visibility
scope** — public or admin — and the helper that builds the `where` clause throws
if one does not. Publication is a separate axis from sale status, so a new read
that simply forgot to filter would quietly serve drafts; this makes that
omission impossible rather than merely discouraged. Only `getWorkById` is
admin-scoped, because the admin has to open works it has not published.

## The work record, as the repository returns it today

| Field | Notes |
|---|---|
| `id` | The database uuid, as a string. Meaningless outside the database — **not** the slug, **not** the image filename stem |
| `slug` | Per locale — `{ he, en }`. See i18n.md |
| `title` | Per locale |
| `description` | Per locale. Nullable — null means not written yet, though every seeded work carries the placeholder copy |
| `medium` | Per locale in shape only. Holds the raw database key in both languages, or null — see the note below |
| `dimensions` | `{ width, height, unit }` — physical size of the painting |
| `price` | `{ amount, currency }` — `amount` is **whole shekels** |
| `year` | |
| `category` | `landscape` \| `still-life` |
| `status` | `available` \| `reserved` \| `sold` \| `not-for-sale` |
| `images` | Ordered collection; each has a type: `main`, `detail`, `in-situ` |
| `featured` | Marks the homepage hero work |
| `addedAt` | What "most recent" orders by |
| `hasPlaceholderData` | True while the stand-in values below are still in place |

`WORK_STATUSES` and `WORK_CATEGORIES` are re-exported by the repository — import
them from there, and never retype the string literals in a component.

`IMAGE_TYPES` is declared alongside them in `artworks.js` but is **not**
re-exported and currently has no importer. Anything that needs it should be
given the same re-export rather than reaching into the fixture.

## Where the fixture and the database disagree

The schema was derived from the fixture's record, but four things are
deliberately different. They were the traps in the swap; they are now live code,
and each is still the thing that breaks if someone edits carelessly.

**Money units.** The database stores `price_agorot` — a whole number of **minor
units**. The fixture holds `price.amount` in **whole shekels**, because
`lib/format.js` renders it with `maximumFractionDigits: 0`. A hundredfold
difference that both sides render as a plausible integer.

> The conversion lives in the repository, in one place — `toMajorUnits`, applied
> as rows become work objects — and nowhere else. Not in a component, not in
> `lib/format.js`, not at each call site. `scripts/seed-local-database.mjs` has
> the other direction (`toAgorot`), for writing the fixture's shekels back down
> into agorot.

Divide a second time somewhere and the two sites disagree; remove the division
and a ₪999 painting is offered for ₪99,900. Nothing in either layer complains.

**The identifier.** In the fixture, one string is the id, the English slug and
the image filename stem. In the database it is none of those: the key is a
generated uuid with no meaning outside the database, and each slug is its own
column. So `getWorkById` now takes a uuid — `/admin/works/[id]` addresses works
by it — and it compares as text so that a malformed id 404s instead of raising a
type error. **Nothing may derive an image path from a work's id.** The image's
location is `work_images.image_ref`, and that is what the repository reads.

**Publication.** The fixture has no notion of a draft: every record is visible.
The database has `published_at`, where null means a draft the public site must
not show. Every public read filters on it, and the repository refuses to build a
query that has not said which scope it is in — see the third property above.
That is the mechanism that replaced "remember the filter".

**Medium.** In the fixture it is free text per locale, with the placeholder
`[PLACEHOLDER] Medium not recorded yet`. In the database it is a closed set of
two keys — `oil-on-canvas`, `pastel-on-paper` — translated in the application,
and **optional**. There is no key meaning "not recorded yet", so the seeded works
carry no medium at all rather than a fake one, and the placeholder string has
nowhere to go. The repository therefore returns null for every current work.
Where a key *is* present it comes back untranslated in both languages, which is
a deliberately visible seam: translating it needs entries in `he.json` and
`en.json` that do not exist yet. See i18n.md.

The database also carries two fields the work record still has no equivalent for:
`price_reduced_agorot` and `sale_channel`. Nothing reads them yet.

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
