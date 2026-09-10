# Data Layer

**Painting data comes from Postgres.** `lib/data/works-repository.js` queries it
through `lib/db.js` — see database.md for the schema. The swap cost one file and
changed nothing above it: same function names, same arguments, same returned
shapes, which is what the indirection was for.

**There are two data modules now.** `lib/data/orders-repository.js` joined it
with the checkout: it prices a basket and writes an order, and it follows the
same three rules — every function async, plain serializable objects out, and
these two are the only modules that touch the database.

The one thing to know before adding to it: **every amount inside it is agorot**,
read from `works.price_agorot` and written to `orders.total_agorot`. It hands
callers both the integer that will be charged and a major-unit copy for
printing, precisely so that nothing above it ever has a reason to multiply or
divide money. A total assembled anywhere else is a bug, and the checkout form is
built the way it is — handed a pre-computed total per delivery method — to make
that impossible rather than merely discouraged.

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
omission impossible rather than merely discouraged.

**Exactly two reads are admin-scoped**, and they are the whole of the exception:
`getWorkById`, because the admin has to open a work it has not published, and
`getWorksForAdmin`, because she cannot get back to a painting she has just
created if the only way to list works hides it. Every other read here — every
one a visitor can reach — is public-scoped.

That makes the scope **the only thing standing between a draft and a visitor**,
and it is load-bearing in two directions now. The preview at
`/admin/works/[id]/preview` renders the *public* artwork body from
`getWorkById`: one body component, two routes, two scopes. And the admin's list
exists precisely because widening a public read to serve it would have published
every draft on the site in one line. Add an admin read rather than loosening a
public one, every time.

## The work record, as the repository returns it today

| Field | Notes |
|---|---|
| `id` | The database uuid, as a string. Meaningless outside the database — **not** the slug, **not** the image filename stem |
| `slug` | Per locale — `{ he, en }`. See i18n.md |
| `title` | Per locale |
| `description` | Per locale. Nullable — null means not written yet, though every seeded work carries the placeholder copy |
| `medium` | Per locale in shape only. Holds the raw database key in both languages, or null — see the note below |
| `dimensions` | `{ width, height, unit }` — physical size of the painting |
| `price` | `{ amount, reducedAmount, currency }` — both in **whole shekels**, converted once in the repository. `reducedAmount` is null when there is no discount, and a discounted work is **still `available`**: this is a price, never a status |
| `year` | |
| `category` | `landscape` \| `still-life` |
| `status` | `available` \| `reserved` \| `sold` \| `not-for-sale` |
| `saleChannel` | `this-site` \| `under1000` \| `elsewhere`, or null. Which channel it sold through — the question `status` leaves open. **Admin-facing only: nothing on the public site may render it** |
| `images` | Ordered collection; each has a type: `main`, `detail`, `in-situ` |
| `featured` | Marks the homepage hero work |
| `addedAt` | What "most recent" orders by |
| `publishedAt` | When it went live, or **null for a draft**. The only field that answers "is this on the public site" — a sale status never does. Always non-null on a work returned by a public read; it is here for the admin, which sees both kinds |
| `hasPlaceholderData` | True while the stand-in values below are still in place. False on anything the artist entered herself |

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
Where a key *is* present it comes back untranslated in both languages, because
medium is not bilingual content: both keys have entries in `he.json` and
`en.json`, and `components/ui/mediumLabel.js` is the single place that turns one
into words. The repository knows nothing about dictionaries and should not start.
See i18n.md.

**Sale channel.** `sale_channel` is read back on every work, beside `status`,
and it is the one field on the record that is **admin-facing only**. A visitor
has no use for the fact that a painting went through another platform, and
rendering it would turn the artist's sales channels into public information. It
was written but not read for a while — the write path stored it and the column
list omitted it — which is the failure this whole table exists to make visible.

**Reduced price.** `price_reduced_agorot` is now read as `price.reducedAmount`.
It is read for a reason that has nothing to do with displaying it: the admin's
edit form has a field for it, and **a form that cannot see a stored value
overwrites it with blank the first time anything else on the record is saved.**
A discount vanishing because the artist fixed a typo in a title is the kind of
loss nobody notices until a buyer is charged full price. How a reduced price
should be *presented publicly* is still undecided — see commerce.md — and
reading it here does not decide that.

Every column on `works` is now read except `featured`'s companion housekeeping
(`created_at`, `updated_at`). Two fields were written-but-never-read for a
while — `sale_channel` and `price_reduced_agorot` — and both were found the same
way: something needed to display or edit them. **When you add a column, add it
to `WORK_COLUMNS` and `toWork` in the same change**, or the gap sits there
silently until a form quietly destroys the value.

## Placeholder data

**Out of date for the database, still true of the fixture.** The sixteen works
now carry the artist's real dimensions, prices, media, Hebrew titles and Hebrew
descriptions, taken from her under1000 listings; `year` and `description_en` are
null rather than stand-ins. `lib/data/artworks.js` still holds everything below,
which is why `seed:local` is now destructive — see app-files.md.

Dimensions, prices, descriptions, media and years are **not known yet**. The
stand-in values are deliberately absurd — 999x999 cm, 99,999 shekels, year 1000,
and copy prefixed `[PLACEHOLDER]` in English and `[טקסט זמני]` or `[ממלא מקום]`
in Hebrew — precisely so they cannot be mistaken for real data or ship by
accident. Titles, categories, slugs and images are real; everything else is
knowingly fake until the artist supplies it.

Do not "tidy" them into plausible-looking values.

## Writing

`createWork`, `updateWork`, `deleteWork`, `unpublishWork` and `setMainImage` are
the writes, and the same three rules apply: async, plain objects out, and this
is still the only module that touches the database.

**`createWork` takes an optional image** and writes it in the **same
transaction** as the work. That is not tidiness: a work saved whose image
insert then failed is a painting she was told was created, sitting in the list
with an empty frame, with nothing to say the photograph she watched upload was
dropped. Two writes cannot promise they both happened; one transaction can.
Both inserts go through the same `insertMainImage` helper, which takes a client
rather than the pool for exactly that reason.

**`setMainImage` is the other one that writes `work_images`**, and the only write
here that needs a transaction. `work_images_one_main` is a partial unique index,
so the new row cannot be inserted before the old one is deleted; doing the two
without a transaction leaves a window where the work has no image, and if the
insert then failed it would stay that way. It takes dimensions that
`lib/image-host.js` read back from the host — never numbers a browser
reported — and it deliberately does not touch `alt_he` / `alt_en`, because
absent means "derive it from the title". The previous file is left on the host;
only the row is replaced. See images.md for why.

Two things about the two before it:

- **`deleteWork` deletes nothing but the row.** `work_images` cascades in the
  schema, so the images go with it; a loop here would be a second place that has
  to be kept in step with the database, and the first thing forgotten when a
  third child table appears. It turns the `order_lines` restrict violation into
  `WorkHasOrdersError` so the admin can say it in Hebrew rather than showing a
  constraint name — and it does **not** read the orders table first, because a
  check-then-act is a race and a second home for a rule the schema enforces.
- **`unpublishWork` exists so the delete confirmation can offer something other
  than deleting.** It produces exactly the state unticking "published" produces,
  and the known limit above applies: the original publication date is gone.

Two things are specific to updating:

- **Publication does not reset.** `published_at` is filled with
  `coalesce(published_at, now())`, so saving a published work again keeps the
  date it originally went live rather than bumping it on every edit.
  Unpublishing sets it back to null, which is how a work comes off the public
  site without being deleted.
  > **Known limit:** unpublishing *destroys* the original date, so a work that
  > is unpublished and later republished gets a new one. Preserving it across
  > that round trip needs a second column — a `first_published_at`, i.e. a new
  > migration — because one nullable column cannot hold both "is it public" and
  > "when did it first go live". Not built; decide whether it matters before
  > building it.
- **Slugs are written as given.** Refusing to change a published work's slug is
  a rule about what the admin may offer, and it lives in the action, where the
  current publication state is known. A repository that silently ignored part of
  its own input would be worse — the caller would have no way to tell.

Two things about it are worth knowing before adding the next one:

- **It does not check who is calling.** Authorisation belongs to the caller —
  every admin mutation verifies the session itself, see security.md — because a
  repository that quietly enforced it would be doing two jobs and would be the
  wrong place to look for either.
- **It does not validate.** `lib/data/work-input.js` does that, and hands the
  repository a record whose money is already in agorot and whose closed sets are
  already checked. Two validators drift; one does not. A slug collision is the
  exception, because only the database can know about it — it comes back as a
  `DuplicateSlugError` naming which language collided, so the admin can say
  which box to change instead of showing a constraint name.

The money conversion still happens in exactly one place per direction:
`toMajorUnits` in the repository on the way out, and `validateWorkInput` on the
way in. Nothing in `createWork` multiplies by 100, and nothing there should
start to.

## Adding data access

When a page needs data the repository does not expose, add a function to the
repository rather than filtering in the component. The component should ask for
what it wants — "the available still lifes" — not fetch everything and sift.
