# Project Overview

## Read this first

A public, bilingual (Hebrew + English) website where **Orit Bar Shai** shows and
sells her paintings. Two things matter equally: it is a **gallery** — the work
must be presented beautifully — and it is a **real store** — cart, card payment,
and a piece that marks itself sold once bought. The artist manages all content
herself through an admin panel; she is not technical, and every admin decision
should be judged by whether she can do it alone.

Every painting is a **one-off**. There is no stock of two. That single fact
drives most of the non-obvious rules in this repo.

### The five rules that are violated most easily

1. **No literal user-facing text in a component.** Every string comes from a
   locale file. Both languages, always, even for placeholder copy. → i18n.md
2. **Nothing outside `lib/data` imports `lib/data/artworks.js`.** Pages and
   components go through `lib/data/works-repository.js`. → data-layer.md
3. **Never crop a painting.** Mixed aspect ratios are the norm here, not an
   edge case. Fit inside a fixed container; never fill it. → images.md
4. **Status is not a boolean.** `available | reserved | sold | not-for-sale`,
   plus the channel it sold through. → commerce.md
5. **The site chrome must not compete with the art.** Warm neutral surfaces,
   plus exactly one accent — a deep terracotta, used only for interactive
   things. No second accent, no decorative colour. → frontend/styles.md

## What this is

A public bilingual (Hebrew / English) website where **Orit Bar Shai** shows and
sells her paintings. It is an art site first and a shop second, but it is fully
a shop: cart, card payment, and automatic sold-marking on purchase.

The artist is a former interior stylist who came to painting later in life. She
also owns **Gita**, a Scandinavian home-design store — that business is separate
and is not part of this site. She currently also sells through the Israeli art
platform **under1000**, and will likely keep doing so after launch, which is why
availability is modelled as more than sold / not sold.

Her work: oil on canvas and pastel on paper. Two subject families — landscapes
(Tuscan houses, water, forests, sunsets) and still life (fruit, flowers, wine and
whiskey, vessels). Warm ochre and terracotta grounds, deep olive, cool blue-greens.
Sizes roughly 30×30 to 50×70 cm, prices roughly ₪900–₪3,500.

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16, App Router |
| Language | JavaScript, ES modules. No TypeScript |
| React | React 19 |
| Styling | Plain CSS — `app/tokens.css` + `app/globals.css`, co-located CSS Modules per component. No framework, no component library |
| Images | `public/paintings/` + Next's built-in image pipeline today; **Cloudinary later** |
| Database | Neon (PostgreSQL) — **not wired up yet** |
| Auth | Admin-only login for the artist — **not built yet**; planned as httpOnly JWT cookies |
| Payments | Provider not chosen yet — Stripe vs an Israeli provider that issues a tax invoice |
| Host | Vercel, one deployment, region `fra1` |

Frontend and backend are the same app. There is no `client/` or `server/` split
and there must not be one — a previous project of the owner's used that shape and
it does not apply here.

## Repository layout

```
.
├── app/                  every route, plus the admin area and API handlers
│   ├── (site)/[locale]/  the public site — its layout is the ONLY place
│   │                     <html lang dir> is set
│   ├── (admin)/admin/    the admin area, outside the locale structure
│   ├── api/              route handlers
│   ├── tokens.css        design tokens — the only place colours/spacing live
│   ├── globals.css       reset and base styles
│   ├── fonts.js          the two faces, loaded once via next/font
│   └── robots.js         disallows /admin and /api
├── components/           UI, grouped by area (layout / home / ui)
├── lib/
│   ├── i18n/             locale config, dictionary loader, locales/*.json
│   ├── data/             the data access layer — see data-layer.md
│   └── format.js         locale-aware price and dimension formatting
├── database/             schema and migrations. Present, empty
├── scripts/              operational scripts, no dependencies
├── public/paintings/     the painting images
├── proxy.js              locale gate — redirects any path with no locale
│                         prefix to the default language
├── CLAUDE.md             intentionally empty — see workflow.md
└── .claude/rules/        ← you are here
```

There are **two root layouts**, one per route group, and therefore no top-level
`app/layout.js`. That is what lets the admin have a completely separate shell.
File-by-file detail lives in app-files.md.

## Route map (locked)

Public, all under `/[locale]` where locale is `he` (default, RTL) or `en` (LTR):

| Route | Purpose |
|---|---|
| `/[locale]` | Home — hero, works grid, promises row, story section |
| `/[locale]/gallery` | Full catalogue with filters and pagination |
| `/[locale]/art/[slug]` | One painting. Large image, details, price, buy or sold |
| `/[locale]/about` | The artist's story |
| `/[locale]/contact` | Contact and commission enquiries |
| `/[locale]/cart`, `/checkout`, `/order/[id]` | Purchase flow |
| `/[locale]/legal/terms` | Terms |
| `/[locale]/legal/shipping-returns` | Shipping and cancellations |
| `/[locale]/legal/privacy` | Privacy |
| `/[locale]/legal/accessibility` | Accessibility statement — legally required in Israel |

Admin, Hebrew only, outside the locale structure, never indexed:
`/admin/login`, `/admin`, `/admin/works/new`, `/admin/works/[id]`,
`/admin/orders`, `/admin/orders/[id]`, `/admin/settings`.

All of the above exist as routes except **`/admin/settings`**, which has not been
built — nothing has needed a setting yet. `/admin` is the dashboard itself, not a
redirect to one.

## Homepage section order (locked)

1. Minimal top navigation — gallery, about, contact, language switcher, cart
2. Hero — **studio footage of the artist painting**, and a single positioning
   line. Not a painting: the grid immediately below shows twelve, so a
   thirteenth above it did the grid's job worse on the most valuable screen of
   the site. What the grid cannot say is that these are physical objects made
   by hand, which is what a first-time buyer needs. Still not a carousel.
   A poster still is the LCP element and a complete hero on its own; the loop
   is deferred over it — see app-files.md.
3. Works grid — twelve pieces with title, price and status; link to the gallery
4. A row of four short promises — original one-off work, signed by the artist,
   insured shipping in Israel, 14-day cancellation
5. Story section — a photo of the artist, a short paragraph, link to About
6. Footer — social, contact, legal links

The visual reference is the artist's own store site, gitahomedesign.co.il:
minimal navigation, generous white space, photography dominant, a promises row,
then the founder's story, then contact. Two deliberate departures from it: no
hero carousel, and the homepage grid shows **works**, not categories.

## Current state

The repo is a **working skeleton plus a complete homepage prototype**. The
homepage is built for real; every other page is a stub — an identifying heading
and clearly-marked placeholder copy from the dictionary, and no logic.

| Area | Status |
|---|---|
| Project scaffold, Next config, Vercel config | Done |
| i18n config, dictionary loader, `he`/`en` locale files | Done |
| Data access layer + local records + image manifest | Done |
| Design tokens, global styles, the two faces via `next/font` | Done |
| The 16 painting images in `public/paintings/` | Done |
| Both root layouts, public shell, admin shell | Done |
| Every route in the locked map above | Done — as stubs, except the homepage |
| The four homepage sections + UI primitives | Done |
| `/admin/settings` | Not built |
| Gallery filters and pagination, artwork page body | Not built yet |
| Cart, checkout and order logic | Not built yet |
| Sitemap, OG images, hreflang tags | Not built yet — required by seo.md |
| Database, auth, payments, Cloudinary | Not started |

Exactly **two client components** exist — the language switcher, and the hero's
studio loop. Everything else is a server component. Both are leaves, and the
hero's poster is server-rendered so nothing above the fold waits on JavaScript.
See app-files.md.

## Placeholder data — read before touching content

Titles, categories, slugs and the sixteen images are **real**.

Dimensions, prices, descriptions, media and years are **not known yet**, and are
filled with deliberately absurd stand-ins so they can never be mistaken for real
values or ship by accident: `999 × 999 cm`, `₪99,999`, year `1000`, and copy
prefixed `[PLACEHOLDER]` / `[טקסט זמני]`. Prices additionally render with a
visible "sample price" marker, driven by `hasPlaceholderData` on each work.

Do not tidy these into plausible-looking values, and do not write real marketing
copy — **including the four homepage promises**, whose real wording is settled
(see the section order above and commerce.md) but is deliberately not in the
locale files yet. When the real values arrive they replace the constants at the
top of `lib/data/artworks.js`.

No photograph of the artist has been supplied. `StorySection` renders a labelled
empty frame at the right proportions rather than a stock portrait or a stand-in
face.

## Key decisions, and why

- **Next.js over the owner's previous Vite + Express setup**: this is a public,
  image-heavy, SEO- and share-sensitive store. Server rendering, metadata, social
  previews and image optimisation are core requirements, and one deployable is
  simpler to run.
- **Separate slug per language.** `/he/art/לימונים` and `/en/art/lemons` are the
  same painting. Most buyers are Israeli and Hebrew URLs earn search traffic.
  Changing a published slug breaks links — treat slugs as permanent once live.
- **Two categories only** — `landscape` and `still-life` — as a filter on one
  gallery, not as separate collection pages. Collection pages stay possible later
  without a migration because the category is already a field.
- **Status is a four-value field, never a boolean.** See commerce.md.
- **The chrome must not compete with the art.** The paintings are highly
  saturated, so the surfaces are warm neutrals. A single deep-terracotta accent
  carries interaction only — it is drawn from the same family as the work
  rather than invented against it, and it never appears as ornament.
- **Typography is decided: Frank Ruhl Libre for display, Assistant for body.**
  Chosen because the two scripts carry matched optical weight — the test a
  Latin-only shortlist never runs, and the one that matters when most visitors
  read Hebrew.
- **The current photographs are low-resolution stand-ins** (capped at 1600px by
  WhatsApp compression, two of them far smaller). They are fine for development.
  Replacing them with proper photography is a **launch blocker**. Do not design
  around their limitations — build for large, sharp images.
