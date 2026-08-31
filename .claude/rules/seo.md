# SEO & Sharing

These pages get shared in WhatsApp and found in Google. Both matter more here
than on a typical app.

## Metadata

Every public page defines its own title and description, from the locale
dictionary — never hardcoded, never a single site-wide default reused everywhere.

An artwork page's metadata is built from the work: its title in that language,
its medium and size, its price when available.

## Social previews

**The Open Graph image for an artwork page is the painting itself.** This is the
highest-value SEO detail on the site: when someone sends a link to a friend, the
painting is the message.

Every public page needs a sensible OG image; the homepage uses the featured work.

## hreflang

Every public page declares its alternate-language counterpart, and the pairing
must be reciprocal. On artwork pages this means resolving the work's slug in the
other language via the repository — not guessing at a URL. A wrong hreflang is
worse than none.

## Sitemap and robots

The sitemap covers every public route in every locale, including one entry per
artwork per language. It is generated from the repository, not maintained by hand.

**Published works only.** A work whose publication timestamp is empty is a draft
and must not appear in the sitemap, in an hreflang pair, or in any other public
surface — the same filter that keeps it off the gallery. Listing a draft in a
sitemap invites Google to index a page the site does not intend to serve, and
publication status is not the same question as sale status: a sold work is
public, an unpublished one is not.

`robots` disallows `/admin`. `vercel.json` additionally sends
`X-Robots-Tag: noindex, nofollow, noarchive` on `/admin/*` — belt and braces,
because an admin page leaking into search is embarrassing and permanent.

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
