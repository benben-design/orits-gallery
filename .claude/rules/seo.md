# SEO & Sharing

These pages get shared in WhatsApp and found in Google. Both matter more here
than on a typical app.

**The artwork page is done; the rest is not.** `/[locale]/art/[slug]` carries a
title, a description, a canonical URL, both language alternates and the painting
as its share image, and `app/sitemap.js` covers the whole public site. The other
public pages still declare no alternates of their own, and nothing anywhere emits
structured data. Both are named again at the foot of this file.

All of it rests on `lib/site-url.js`, the only reader of `NEXT_PUBLIC_SITE_URL`
and the only place a path becomes absolute.

## Metadata

Every public page defines its own title and description, from the locale
dictionary — never hardcoded, never a single site-wide default reused everywhere.

An artwork page's metadata is built from the work: its title in that language,
and a description that is **her own sentence when she has written one**. Every
seeded record carries a bracketed placeholder description instead, so the page
falls back to a line that is true of any painting here — `artwork.shareDescription`
in the locale files — and `hasPlaceholderData` is what tells the two apart. The
stand-ins stay visible on the page; a share preview is the one surface where
publishing one would do damage rather than good, because it is what a stranger
sees before deciding whether to open the link.

**Metadata runs even when the page will 404.** Next resolves `generateMetadata`
separately from the component, so neither `notFound()` nor the cross-language
redirect stops it. A slug that resolves to nothing — a typo, or a draft whose URL
someone guessed — must be answered without asserting that a work by that name
exists.

## Social previews

**The Open Graph image for an artwork page is the painting itself.** This is the
highest-value SEO detail on the site: when someone sends a link to a friend, the
painting is the message.

Every public page needs a sensible OG image; the homepage uses the featured work.

**The crop question, decided.** Platforms want roughly 1200x630 and these
paintings run from 0.62 to 1.51, so no one file satisfies both that and the rule
that a painting is never cropped. The artwork page hands over **the painting
itself, whole** — scaled to at most 1200 wide, never cropped — and lets each
platform frame it.
Generating a 1200x630 card with the work letterboxed on the wall colour was
rejected twice over: most of that image is empty mat, and the platforms with a
squarer preview crop *it* — so the painting ends up smaller and still cropped, in
exchange for an image pipeline that does not exist. The rule images.md states is
that **we** never crop a work; what Facebook does inside its own card is not a
decision this repository gets to make. If previews look wrong once the real
photography lands, a generated letterboxed card is the thing to build.

A work with no photograph yet ships no image at all, rather than a stand-in
nobody chose.

**The share image is delivered through the image host, as a JPEG at most 1200
wide** — `q_auto,c_limit,w_1200` on an address ending in `.jpg`, built by
`shareImageFor` in `lib/image-loader.js` (since 29-09-2026; the `.jpg`
address since 30-09-2026). It used to be the stored original,
untransformed, which broke twice over: an original after the re-shoot can be
10MB, and WhatsApp drops the preview for a heavy image; and an original uploaded
as HEIC is a file no crawler can show. Every format goes through it, not only
HEIC.

- **JPEG, fixed, not `f_auto`.** A crawler does not negotiate formats the way a
  browser does, so the one format every platform reads is asked for outright —
  by the address's extension, which the host delivers, and not by `f_jpg`. The
  host counts the extension as part of the transformation, so `f_jpg` on each
  original's own extension would be one allowed entry per source format under
  strict transformations; see images.md.
- **`q_auto`** keeps it light: the fourteen hosted works come out at 75–221 KB,
  against originals of over a megabyte.
- **`c_limit`, width only**, so it never crops and never enlarges — an original
  narrower than 1200 is served at its own width. `check:crop` holds this
  transformation to the same rule as the loader's.
- **`og:image:width` and `og:image:height` are the served file's**, computed to
  match what `c_limit` returns (the height rounded from the painting's ratio).
  Verified on 29-09-2026 against every published work in both languages: each
  declared size equal to the served JPEG's, to the pixel.
- **A local file is handed over as it is** — it is not on the host. That is one
  work today, `two-pears`, a WhatsApp-compressed JPEG of 1582x1600 and 326 KB.
  It is absolute, served by this site.

`absoluteUrl` still has to leave an already-absolute URL alone: a hosted share
image is `https://res.cloudinary.com/…`, and prefixing the site address to one
produced a preview that resolved to nothing. It went unnoticed for as long as
every image was local.

## hreflang

Every public page declares its alternate-language counterpart, and the pairing
must be reciprocal. On artwork pages this means resolving the work's slug in the
other language via the repository — not guessing at a URL. A wrong hreflang is
worse than none.

## Sitemap and robots

**Until launch the whole site is blocked from search** (since 25-10-2026): every
response carries `X-Robots-Tag: noindex, nofollow, noarchive`, every public
page a robots meta, and `robots.txt` disallows everything without naming the
sitemap. One switch, `ALLOW_SEARCH_INDEXING`, blocked unless exactly `true` —
see `lib/search-indexing.js` and deployment.md, which also records the one limit
kept knowingly: a crawler that obeys the disallow never reads the `noindex`.
Everything below describes the
site after launch.

The sitemap covers every **built** public page in every locale, including one
entry per artwork per language. It is generated from the repository, not
maintained by hand — `app/sitemap.js`, which enumerates `locales` and never
spells out a language, so adding one stays the two-step job i18n.md promises.

**Only pages that exist.** A stub is not a page, and offering one is worse than
offering nothing: thin content indexed early is expensive to undo, and a first
deployment is exactly when it would happen. The four `/legal` pages are absent
until they carry real copy.

**`/about` and `/contact` are built, and conditional.** Their content is the
artist's site settings, so either can exist and still be empty. While it is,
the page marks itself `noindex, follow` and `app/sitemap.js` leaves it out, by
the same test in both places, so the sitemap never offers a page that asks not
to be indexed.

**How a path joins.** The three lists are in `lib/public-routes.js` and
`scripts/check-sitemap.mjs` holds them against the filesystem: every public page
must be a stub, a declared exclusion, or listed. A stub that is listed fails the
check, and so does a finished page that is in none of the three — so neither
half depends on somebody remembering. A page becomes eligible by no longer
rendering `StubPage`, which is the same act as building it.

The purchase flow is deliberately absent, and declared as such rather than
merely missing. A cart, a checkout and an order page are per-visitor states
rather than pages with anything to rank, and an order addressed by id has
nothing to say to anyone but its buyer.

Now that the cart is built, it says so itself as well: its `generateMetadata`
returns `robots: { index: false, follow: true }`. Being out of the sitemap keeps
a page from being *offered*; it does not keep it from being *found*, and a link
to a cart is a link like any other. `follow: true` because the paintings linked
from it are pages worth reaching. It declares no canonical and no alternates —
there is no second-language version of somebody's own choices worth pairing.

`robots.txt` points at the sitemap, which is one more URL that cannot be built
without the base address.

**Published works only.** A work whose publication timestamp is empty is a draft
and must not appear in the sitemap, in an hreflang pair, or in any other public
surface — the same filter that keeps it off the gallery. Listing a draft in a
sitemap invites Google to index a page the site does not intend to serve, and
publication status is not the same question as sale status: a sold work is
public, an unpublished one is not.

`robots` disallows `/admin`. An `X-Robots-Tag: noindex, nofollow, noarchive`
header on `/admin` — the design system at `/admin/dev` included — sits beside it: belt and braces, because an
admin page leaking into search is embarrassing and permanent.

**That header is declared in `next.config.mjs`, and it has to be.** A rule
written in the host's own configuration is applied only to responses Netlify
serves from its store, never to one produced by a function — and every admin
route is server-rendered, so host configuration is the one place the rule would
look present and protect nothing. Declared in the framework it is part of the
response whatever rendered it. See deployment.md.

## Rendering

Public pages are server-rendered or statically generated. A painting that only
appears after client-side JavaScript is a painting Google cannot see and a link
preview cannot show. Artwork routes should pre-generate their params from the
repository.

## Structured data

Artwork pages should describe themselves as products with availability and price
so search results can show them correctly. Availability must reflect the real
status — advertising a sold painting as available is both a bad result and a
customer-service problem.

Two details that follow from the schema: a work carrying a **reduced price** is
still available, and the price advertised must be the one that would actually be
charged. And the price is stored in **minor units**, so whatever builds the
structured data converts once, in the same place everything else does — a
structured-data price a hundred times too large is a bad search result the site
cannot see.

## Slugs are permanent

Once a work is published, its slug in either language must not change. Changing
it breaks every shared link and discards the page's search history. If a title
genuinely must change, the slug stays and a redirect is added.
