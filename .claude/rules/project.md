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
   edge case. Fit inside a fixed container; never fill it. The artist's own
   portrait is the one exception — it is not a work — and it has its own
   component so the exception cannot reach a painting. → images.md
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
| Styling | Plain CSS — `app/tokens.css` + `app/globals.css`, co-located CSS Modules per component. No framework, no component library. **Icons come from `lucide-react`**, which reverses an earlier decision to hand-draw them; see code-style.md for the reasoning and the one thing to know about it |
| Images | Two sources, deliberately, and two resizers. The sixteen seeded paintings are files in `public/paintings/`, resized by Next's own optimiser; anything the artist attaches herself is on **Cloudinary**, uploaded from the browser straight to the host under a signature this app produces, and resized **by the host** so the work is not done and metered twice. `lib/image-loader.js` picks per image; every component renders both identically. No transformation may crop — `npm run check:crop` |
| Database | PostgreSQL. **The site reads it** — every painting comes from Postgres through `lib/data/works-repository.js`. Local Postgres (`art_studio`) in development, schema applied by hand from `database/migrations/`. **Neon for production — connected**: "Orit's gallery", US East (Ohio), PostgreSQL 18, carrying 001 through 010, the catalogue and both admin accounts since 12-09-2026. Two databases now, so every migration is applied to both. Nothing is deployed against it yet |
| Auth | **Built.** Two accounts with equal rights, the artist's and the developer's. scrypt password hashing, accounts created by `npm run admin:create`, sign-in and sign-out through a signed httpOnly cookie with no session table, and every guarded admin page redirecting a visitor without a session to the login form. The guard covers **rendering only** — mutations verify the session themselves, see security.md |
| Translation | Google's Gemini, behind `lib/translate.js`, called only from `/admin/api/translate`. Fills the admin form's English fields in from the Hebrew, unapproved until she reads them. **Optional** — with no key the English is typed by hand |
| Payments | **Hyp Pay**, on the yaad-sarig platform — docs at developers.hyp.co.il, chosen after research and a call with them. The buyer is sent to Hyp's own hosted payment page, so no card detail touches this server, and the charge is **direct (J2)** rather than authorize-then-capture. **This tier has no webhook and no transaction-status query**, so the only completion signal is the buyer's browser returning to us, which the server validates with the provider's VERIFY call before writing anything. Tax invoices are issued by the artist by hand for v1. **Not built** — the three keys are named in `.env.example` and nothing reads them yet |
| Host | **Netlify**, one site, one deployment. `netlify.toml` is the build command, a pinned Node 22 and two settings that narrow the secrets scan, and nothing else; everything else is detected, and region selection is a paid-plan feature, so the old Frankfurt pin has no successor. **The noindex headers are declared in `next.config.mjs`**, because a host header rule is never applied to a server-rendered response and every admin route is one. Free tier while building, paid tier the day the site can take money |

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

All of the above exist as routes. `/admin/settings` was the last, built on
27-09-2026 over migration 011. `/admin` is the dashboard itself, not a
redirect to one.

## Homepage section order (locked)

1. Top navigation — one bar on the clay band, the artist's name as a
   brush-lettered mark centred in it, gallery / about / contact on one side and
   the language switcher and cart on the other. Two rows below 56rem — it was
   64rem while a WhatsApp shortcut sat in the row, which is what that figure
   was measuring. **Reaching the artist is a floating button now**, fixed to
   the bottom-left corner of every public page but checkout
2. Hero — **studio footage of the artist painting**, a single positioning
   line, and one filled button into the gallery. Not a painting: the grid immediately below shows twelve, so a
   thirteenth above it did the grid's job worse on the most valuable screen of
   the site. What the grid cannot say is that these are physical objects made
   by hand, which is what a first-time buyer needs. Still not a carousel.
   A poster still is the LCP element and a complete hero on its own; the loop
   is deferred over it — see app-files.md. **The loop can be stopped**, by a
   control in the frame reachable by keyboard in both languages, because a
   thing that moves by itself and never stops is a Level A failure; stopping it
   uncovers that still, which is a frame of the same footage.
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
| Host configuration | **Done.** `netlify.toml` carries the build command, a pinned Node 22, and the two settings that narrow the secrets scan to exclude Turbopack's build cache and the public Cloudinary cloud name — narrowed, never disabled, see deployment.md; the old Vercel configuration file is deleted, and the `X-Robots-Tag` noindex headers it held are declared in `next.config.mjs` — the only place they work for a route the host renders in a function. Nothing is deployed, so they are proven against a local production build rather than against Netlify |
| i18n config, dictionary loader, `he`/`en` locale files | Done |
| Data access layer + seed fixture + image manifest | Done |
| Design tokens, global styles, the two faces via `next/font` | Done |
| The 16 painting images in `public/paintings/` | Done |
| Both root layouts, public shell, admin shell | Done |
| Every route in the locked map above | Done. The four legal pages are still stubs; About and contact are built from the site settings |
| The four homepage sections + UI primitives | Done |
| Gallery | Built — the full catalogue, filtered by category through the URL. **Pagination deliberately not built** at sixteen works |
| Deleting a painting | Built — from the works list, behind a confirmation that asks a **different question** of a draft and of a published work, and offers taking it off the site instead of breaking a permanent address. One click never deletes. A work on an order cannot be deleted at all |
| Finding a painting in the admin | Built — `/admin` **is** the works list: every work with its publication state, sale status and sale channel, drafts sorted first, each row opening its edit page. It reads `getWorksForAdmin`, the admin-scoped list added for it |
| Adding a painting from the admin | Built — `/admin/works/new` writes to the database and the work appears on the gallery and the homepage. **Its photograph can be attached here too**, in the same save: the upload waits in a hidden field and the work and its image are written in one transaction, so a painting can arrive complete and published in one step |
| Marking a painting sold | Built — a link on every row of the works list to `/admin/works/[id]/sale`, which asks where it sold and records both in one gesture, and returns a sold work to sale from the same page, clearing the channel with it. **Deliberately not the edit form**: that form will not save while a machine translation is unapproved, so marking a fair sale could fail on an English description nobody had read. A sale through this site is refused with a sentence saying why, because that channel answers for an order. Works with no JavaScript |
| Editing a painting from the admin | Built — `/admin/works/[id]` shares the same form. Saving on either page ends on the works list, with a line saying what happened; only a rejected save stays on the form. Publishing and unpublishing happen here; a published work's address is read-only. **No delete, no featured control** |
| Seeing a work before it is public | Built — `/admin/works/[id]/preview` renders the public artwork body from the admin-scoped read, in either language, behind the guard. A dashed band says whether the work is published; the public route stays published-only |
| English written for her | Built — leaving a Hebrew title or description translates it and fills the English twin, marked unapproved, and **the form does not save while anything is unapproved**. Her own English is never overwritten, and a failure leaves her typing it herself and saving as usual |
| Artwork page body | **Built** — one painting large beside its details, reusing the grid's frame, price, badge and status table. The frame's `bare` mount finally has its caller. No buy button while the cart does not exist |
| Cart | Built, **as a panel that slides in from the edge of the screen**. Adding a painting opens it in place and never navigates. A cookie of work ids and nothing else, so **every fact is re-read from the database**: a painting sold elsewhere while it sat there is caught when the cart is drawn and again when anything is added, and is excluded from the total with a sentence saying why. No quantity anywhere. `/cart` is still the whole page, server-rendered, reachable from the foot of the panel, and the one that will grow a real checkout |
| Checkout controls | **Real.** All three — the drawer's, `/cart`'s, and "buy now" on the artwork page — are ordinary links into `/[locale]/checkout`. The `aria-disabled` attributes and the shared "not open yet" sentence went with them, and that locale key is deleted rather than left unused. "Buy now" carries `?work=<id>`: one painting, cart untouched |
| Checkout | **Built.** Guest checkout, no accounts. Delivery is chosen first because it changes the form — insured shipping at a flat 40 ILS with a full Israeli address, or free self-pickup with **no address field at all**. Validation keeps the typed values; a painting that has gone stops the checkout and is **named**. The order is written `pending` with its lines, buyer, method and fee **before** the buyer reaches payment, and its uuid is the public reference that travels in Hyp's `Order`. Every amount is computed in agorot in the orders repository, for both methods, so nothing in the browser adds up money |
| The admin's orders | **Built.** `/admin/orders` is every order newest first, and **the only notification the artist gets that anything sold** — nothing emails her. It surfaces two things no schema can answer: orders pending over an hour, which may be a buyer who paid and closed the window (check the Hyp console), and orders carrying an **owed refund**, which is money to give back by hand. `/admin/orders/[id]` carries the buyer, the paintings, the delivery, the timeline and the actions — offering only transitions the schema permits, with the repository re-checking each in SQL. Cancelling or refunding returns the paintings to **draft** with the channel cleared, so nothing silently re-lists. It surfaces **all three** reconciliation jobs no schema can do: stale pending orders, owed refunds, and dispatches nobody has confirmed as received — the last after seven days, because the 14-day window is counted from receipt and cannot be computed until somebody marks it |
| Order logic after payment | **Built, and proven against simulated returns rather than against Hyp — there is no account yet.** Both return routes call VERIFY first and do nothing before it answers; a forged, declined, unreadable or unverifiable return changes nothing anywhere, and missing credentials can never read as success. A verified success seizes every painting by one conditional write (`status = 'available'`, the row count deciding), all-or-nothing, then marks the order paid, then clears the cart — idempotently, so a refresh writes nothing twice. If the painting went to somebody else in between, the charge is voided if it can be and flagged `refund_due_at` if it cannot, and the buyer is told plainly. `/[locale]/order/[id]` is the confirmation. Still missing: the admin's orders pages. See deployment.md for exactly what remains unproven |
| Sitemap, OG images, hreflang tags | **Built for the artwork page**, which carries its title, description, canonical, both alternates and the painting as its share image. `app/sitemap.js` covers every **built** public page in both languages plus one entry per painting per language, published only — the stubs are kept out by `scripts/check-sitemap.mjs` rather than by memory. **Still missing:** hreflang on the other public pages, and structured data anywhere |
| Database schema | Written — **eleven** migrations in `database/migrations/`, run by hand in numeric order against both databases. 011 is the most recent: `site_settings`, the one-row table `/admin/settings` will edit. Nothing reads it yet |
| `/admin/settings` | **Built, and the public site reads it.** One form over migration 011's single row: the About text in both languages (she writes the Hebrew, the English arrives through the work form's own translate-and-approve flow and blocks saving until approved), email, phone, WhatsApp number, Instagram and Facebook links, the flat shipping rate in shekels, a self-pickup switch, and her portrait, uploaded into its own `orit-site` folder. Every database rule is checked first and explained in Hebrew; a cleared field saves as empty, and **an empty field renders nothing anywhere on the site**. The footer, the WhatsApp button, the story section, the About and contact pages and checkout all read it; nothing about them is hardcoded any more |
| Local seed data | `npm run seed:local` fills a local database from `lib/data/artworks.js` |
| Database connection module | `lib/db.js`, imported by the repository and by nothing else |
| Reading painting data from Postgres | **Done.** Every page reads the database through the repository; `lib/data/artworks.js` is the seed fixture |
| Neon | **Connected** — "Orit's gallery", US East (Ohio), PostgreSQL 18, carrying 001 through 010, the catalogue and both admin accounts, since 12-09-2026. Development stays on the local Postgres, so the drift hazard in deployment.md is live from that date. **Nothing is deployed against it**: `DATABASE_URL` is set on no host, and the production `ADMIN_SESSION_SECRET` does not exist yet |
| Admin password hashing + account creation | Done — `lib/auth/password.js`, `npm run admin:create` |
| Admin sign-in and sign-out | Done — signed httpOnly cookie, no session table. See security.md |
| Rate limiting on sign-in | Done — counters in Postgres (migration 006), five failures then an escalating block. Paired with the eight-character password minimum |
| The admin route guard | Done — every page under `(guarded)/` redirects without a session, and signing in returns to the page that was asked for |
| Publishing without a photograph | Refused, with a message saying why — on the site the work would be an empty frame. On the **act of publishing** only: a work already public still saves any field, and a new work therefore cannot be created already published. See commerce.md |
| Attaching a photograph | Built — one **main** image per work, from either admin page. On the edit page it saves on its own the moment the upload finishes; while creating a work it waits for the form, because there is no work to attach it to yet, and the panel says which is happening. The file goes browser-to-host without passing through the server, signed per upload; the server reads the real pixel dimensions back from the host rather than believing the browser. Over 10MB or 25 megapixels is refused before it is sent. Re-uploading replaces the row and leaves the old file on the host. `detail` and `in-situ` images are not built |
| Payments | Not started |

**Thirteen client components exist, and four of them are the cart.** The tenth is the
checkout form, which is one for the reason the admin's two forms are: a rejected
submission has to come back with its errors *and* the typed values intact,
without either travelling through a URL — an address lost to one bad postal
code, one field from paying, is a purchase abandoned. **The twelfth is the
floating WhatsApp button**, and it is one for a reason worth knowing: it is
rendered by the public layout, and a layout cannot know which page it wraps —
so being absent from checkout has to be decided where the path is known.
**The thirteenth is the admin's settings form**, a client component for the
same reason as the other two admin forms.

The other six are the header's primary navigation — client only to mark the
current page — the language switcher, the hero's studio loop, the admin's login
and work forms, and the admin's image upload. Everything else is a server component,
including the gallery and its filters — links and a query parameter rather than
state — and including the `/cart` page, which is server-rendered and works with
no script at all. The hero's poster is server-rendered too, so nothing above the
fold waits on JavaScript. The two admin forms are client components for one
reason: a rejected submission has to come back with its errors and the typed
values intact, without either travelling through a URL.

The cart's four are `CartProvider`, `CartDrawer`, `CartLink` and `AddToCart`,
and they are the one place on this site where interactivity was chosen over
progressive enhancement. **The cart is a panel that slides in over the page and
never navigates**, which cannot be done without script — so adding a painting
needs JavaScript, which the first version did not. That was a deliberate trade,
and `/cart` is what makes it acceptable: the whole cart still exists as an
ordinary server-rendered page, and the drawer links to it.

Two properties of that arrangement are worth remembering, because they shape
every decision like it:

- **`CartProvider` wraps the entire public layout without dragging it into the
  browser.** `children` arrives already rendered from the server and passes
  straight through — a client component hosting server ones, not converting
  them.
- **The count is read from the cookie in the browser, not on the server.** The
  alternative was not "a bit more server code", it was making *every public
  page dynamic to draw one numeral*, because reading a cookie in the layout
  opts the whole subtree out of static rendering. The build output is where
  that is checked: `/[locale]` and every `/[locale]/art/<slug>` must stay `●`,
  with only `/[locale]/cart` as `ƒ`.

The image upload is the exception to that pattern and the **one thing in the
admin that genuinely does not work without JavaScript** — reading a file,
watching a percentage climb and posting to another host has no server-rendered
form. It is why the upload sits outside the work form rather than inside it: the
record still saves with no script at all. See app-files.md.

## Placeholder data — read before touching content

**This section is mostly historical now.** On 2026-09-08 the catalogue was
filled in from the artist's own under1000 listings: real Hebrew titles,
descriptions, dimensions, prices and media are in the database for all sixteen
works, and `has_placeholder_data` is false on every one of them. What follows
describes the **seed fixture**, which still holds the stand-ins and would
reimpose them — see the warning in setup.md before running `seed:local`.

One field is still absent rather than fake, which is the schema's own honest
value: `year` is null on every work. **The English descriptions were machine
translated and written straight to the database**, which deliberately bypasses
the admin's approval gate — see the warning in i18n.md. **Sale statuses are
still demo data** — two sold, two reserved, two not-for-sale — and every one of
those sixteen paintings is listed as available on under1000.

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

**One exception landed on 26-09-2026, by the owner's decision: the hero's
positioning line.** `home.hero.positioning` now reads "Paintings that bring
light into a home",
where every other line on the homepage is still bracketed. Two things about it
are worth knowing rather than rediscovering. **It is in English on the Hebrew
site too** — the same string in both locale files, the `<h1>` marked
`lang="en"`, treated as part of the mark rather than as copy; i18n.md carries
the argument and the caution. **And it has not been through her**, so it is
real copy in the sense that it no longer announces itself as a stand-in, not in
the sense that anybody whose shop it is has approved it.

No photograph of the artist has been supplied yet. It is a site setting now,
uploaded at `/admin/settings`, and until there is one the story section and the
About page show no frame at all rather than a labelled empty one.

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
  read Hebrew. The header's brush name is not a third face: it is Comforter
  Brush outlined into an SVG, an interim until the artist's own signature
  replaces it.
- **The current photographs are low-resolution stand-ins** (capped at 1600px by
  WhatsApp compression, two of them far smaller). They are fine for development.
  Replacing them with proper photography is a **launch blocker**. Do not design
  around their limitations — build for large, sharp images.
