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

## Slugs are permanent

Once a work is published, its slug in either language must not change. Changing
it breaks every shared link and discards the page's search history. If a title
genuinely must change, the slug stays and a redirect is added.
