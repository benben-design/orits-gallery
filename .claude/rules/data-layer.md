# Data Layer

Painting data lives in a local file today and in Postgres later. The whole point
of this layer is that "later" costs one file.

## The rule

`lib/data/works-repository.js` is the **only** module that pages, layouts and
components may import for painting data.

`lib/data/artworks.js` is storage. Nothing outside `lib/data` may import it. When
the database arrives, that file disappears and only the repository changes.

If you find yourself importing `artworks.js` from a page, stop — the function you
need belongs in the repository.

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

## The work record

| Field | Notes |
|---|---|
| `id` | Stable. Doubles as the English slug and the image filename stem |
| `slug` | Per locale — `{ he, en }`. See i18n.md |
| `title` | Per locale |
| `description` | Per locale |
| `medium` | Per locale |
| `dimensions` | `{ width, height, unit }` — physical size of the painting |
| `price` | `{ amount, currency }` |
| `year` | |
| `category` | `landscape` \| `still-life` |
| `status` | `available` \| `reserved` \| `sold` \| `not-for-sale` |
| `images` | Ordered collection; each has a type: `main`, `detail`, `in-situ` |
| `featured` | Marks the homepage hero work |
| `addedAt` | What "most recent" orders by |
| `hasPlaceholderData` | True while the stand-in values below are still in place. Drives the visible "sample price" marker |

`WORK_STATUSES`, `WORK_CATEGORIES` and `IMAGE_TYPES` are exported constants.
Use them; never retype the string literals in a component.

## Placeholder data

Dimensions, prices, descriptions, media and years are **not known yet**. The
stand-in values are deliberately absurd — 999×999 cm, ₪99,999, year 1000, and
copy prefixed `[PLACEHOLDER]` in English and `[טקסט זמני]` or `[ממלא מקום]` in
Hebrew — precisely so they cannot be mistaken for real data or ship by accident.

Do not "tidy" them into plausible-looking values. Titles, categories, slugs and
images are real; everything else is knowingly fake until the artist supplies it.

## Adding data access

When a page needs data the repository does not expose, add a function to the
repository rather than filtering in the component. The component should ask for
what it wants — "the available still lifes" — not fetch everything and sift.
