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
4. **Status is not a boolean, and it is not visibility.**
   `available | reserved | sold | not-for-sale`, plus the channel it sold
   through — and separately a publication timestamp, where empty means a draft.
   A draft may hold any of the four statuses. → commerce.md
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
| Images | Two sources, deliberately, and two resizers. The sixteen seeded paintings are files in `public/paintings/`, resized by Next's own optimiser; anything the artist attaches herself is on **Cloudinary**, uploaded from the browser straight to the host under a signature this app produces, and resized **by the host** so the work is not done and metered twice. `lib/image-loader.js` picks per image; every component renders both identically. No transformation may crop — `npm run check:crop` |
| Database | PostgreSQL. **The site reads it** — every painting comes from Postgres through `lib/data/works-repository.js`. Local Postgres (`art_studio`) in development, schema applied by hand from `database/migrations/`. Neon for production — **not connected yet**, so production has no database at all |
| Auth | **Built.** Two accounts with equal rights, the artist's and the developer's. scrypt password hashing, accounts created by `npm run admin:create`, sign-in and sign-out through a signed httpOnly cookie with no session table, and every guarded admin page redirecting a visitor without a session to the login form. The guard covers **rendering only** — mutations verify the session themselves, see security.md |
| Translation | Google's Gemini, behind `lib/translate.js`, called only from `/admin/api/translate`. Fills the admin form's English fields in from the Hebrew, unapproved until she reads them. **Optional** — with no key the English is typed by hand |
| Payments | Provider not chosen yet — Stripe vs an Israeli provider that issues a tax invoice |
| Host | **Netlify**, one site, one deployment. `vercel.json` is still in the repo from the previous decision and is **not** read by Netlify — replacing it, carrying over its noindex headers, and finding out whether a region can be pinned near Israel are open tasks in deployment.md. Free tier while building, paid tier the day the site can take money |

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
│   ├── auth/             password hashing, the session cookie, the page guard
│   ├── db.js             the pooled Postgres connection, used by the repository
│   ├── image-host.js     signs an upload, and reads the asset back afterwards
│   ├── image-loader.js   which service resizes an image, decided per image
│   └── format.js         locale-aware price and dimension formatting
├── database/migrations/  plain SQL, applied by hand, forward-only
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
| Project scaffold, Next config | Done |
| Host configuration | **Not done.** `vercel.json` describes a host this project no longer deploys to. Nothing is deployed, so no replacement can be verified yet — see deployment.md |
| i18n config, dictionary loader, `he`/`en` locale files | Done |
| Data access layer + seed fixture + image manifest | Done |
| Design tokens, global styles, the two faces via `next/font` | Done |
| The 16 painting images in `public/paintings/` | Done |
| Both root layouts, public shell, admin shell | Done |
| Every route in the locked map above | Done — as stubs, except the homepage |
| The four homepage sections + UI primitives | Done |
| `/admin/settings` | Not built |
| Gallery | Built — the full catalogue, filtered by category through the URL. **Pagination deliberately not built** at sixteen works |
| Deleting a painting | Built — from the works list, behind a confirmation that asks a **different question** of a draft and of a published work, and offers taking it off the site instead of breaking a permanent address. One click never deletes. A work on an order cannot be deleted at all |
| Finding a painting in the admin | Built — `/admin` **is** the works list: every work with its publication state, sale status and sale channel, drafts sorted first, each row opening its edit page. It reads `getWorksForAdmin`, the admin-scoped list added for it |
| Adding a painting from the admin | Built — `/admin/works/new` writes to the database and the work appears on the gallery and the homepage. **Its photograph can be attached here too**, in the same save: the upload waits in a hidden field and the work and its image are written in one transaction, so a painting can arrive complete and published in one step |
| Editing a painting from the admin | Built — `/admin/works/[id]` shares the same form. Saving on either page ends on the works list, with a line saying what happened; only a rejected save stays on the form. Publishing and unpublishing happen here; a published work's address is read-only. **No delete, no featured control** |
| Seeing a work before it is public | Built — `/admin/works/[id]/preview` renders the public artwork body from the admin-scoped read, in either language, behind the guard. A dashed band says whether the work is published; the public route stays published-only |
| English written for her | Built — leaving a Hebrew title or description translates it and fills the English twin, marked unapproved, and **the form does not save while anything is unapproved**. Her own English is never overwritten, and a failure leaves her typing it herself and saving as usual |
| Artwork page body | **Built** — one painting large beside its details, reusing the grid's frame, price, badge and status table. The frame's `bare` mount finally has its caller. No buy button while the cart does not exist |
| Cart, checkout and order logic | Not built yet |
| Sitemap, OG images, hreflang tags | **Built for the artwork page**, which carries its title, description, canonical, both alternates and the painting as its share image. `app/sitemap.js` covers every **built** public page in both languages plus one entry per painting per language, published only — the stubs are kept out by `scripts/check-sitemap.mjs` rather than by memory. **Still missing:** hreflang on the other public pages, and structured data anywhere |
| Database schema | Written — five migrations in `database/migrations/`, run by hand against a local Postgres |
| Local seed data | `npm run seed:local` fills a local database from `lib/data/artworks.js` |
| Database connection module | `lib/db.js`, imported by the repository and by nothing else |
| Reading painting data from Postgres | **Done.** Every page reads the database through the repository; `lib/data/artworks.js` is the seed fixture |
| Neon | Not started — **no production database exists**, so a deploy cannot render a painting |
| Admin password hashing + account creation | Done — `lib/auth/password.js`, `npm run admin:create` |
| Admin sign-in and sign-out | Done — signed httpOnly cookie, no session table. See security.md |
| Rate limiting on sign-in | Done — counters in Postgres (migration 006), five failures then an escalating block. Paired with the eight-character password minimum |
| The admin route guard | Done — every page under `(guarded)/` redirects without a session, and signing in returns to the page that was asked for |
| Publishing without a photograph | Refused, with a message saying why — on the site the work would be an empty frame. On the **act of publishing** only: a work already public still saves any field, and a new work therefore cannot be created already published. See commerce.md |
| Attaching a photograph | Built — one **main** image per work, from either admin page. On the edit page it saves on its own the moment the upload finishes; while creating a work it waits for the form, because there is no work to attach it to yet, and the panel says which is happening. The file goes browser-to-host without passing through the server, signed per upload; the server reads the real pixel dimensions back from the host rather than believing the browser. Over 10MB or 25 megapixels is refused before it is sent. Re-uploading replaces the row and leaves the old file on the host. `detail` and `in-situ` images are not built |
| Payments | Not started |

Exactly **five client components** exist — the language switcher, the hero's
studio loop, the admin's login and work forms, and the admin's image upload.
Everything else is a server component, including the gallery and its filters,
which are links and a query parameter rather than state. All five are leaves,
and the hero's poster is server-rendered so nothing above the fold waits on
JavaScript. The two admin forms are client components for one reason: a rejected
submission has to come back with its errors and the typed values intact, without
either travelling through a URL.

The image upload is the exception to that pattern and the **one thing in the
admin that genuinely does not work without JavaScript** — reading a file,
watching a percentage climb and posting to another host has no server-rendered
form. It is why the upload sits outside the work form rather than inside it: the
record still saves with no script at all. See app-files.md.

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

One placeholder has no home in the database. **Medium is a closed set of two
keys there** — `oil-on-canvas` and `pastel-on-paper`, translated in the
application — and it is optional. There is no key meaning "not recorded yet", so
a seeded work carries **no medium at all** rather than a fake one, and the
`[PLACEHOLDER] Medium not recorded yet` string has nowhere to go. Both keys are
now translated in `he.json` and `en.json`, so a work that does carry a medium
renders it properly.

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
- **Status is a four-value field, never a boolean.** See commerce.md. Whether a
  work is publicly visible is a *separate* nullable timestamp, so a draft can
  hold any of the four statuses.
- **The database key is a generated uuid, independent of the slug and of the
  image filename.** In `lib/data/artworks.js` one string does all three jobs;
  that coupling was not carried into the schema, because it ends the moment
  images move to a hosting service. Nothing may build an image path from a
  work's id.
- **Money is stored in the database as a whole number of agorot** — minor units.
  The seed fixture holds whole shekels, so the repository converts in exactly one
  place on the way out and the seed script converts the other way on the way in.
  A silent mismatch renders a price a hundred times too large. See data-layer.md.
- **Migrations are plain SQL, applied by hand, forward-only, and ASCII-only.**
  No runner, no ORM. See database.md for why the ASCII part is not fussiness.
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
