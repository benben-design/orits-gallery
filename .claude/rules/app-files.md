# File Map

What exists, what it owns, and when to touch it.

**Keep this file current.** When you add a route, a component, or a lib module,
add its row here in the same change. A stale map is worse than no map — it is the
first thing read at the start of a session.

## Config

| File | Role |
|---|---|
| `CLAUDE.md` | **Intentionally empty. Leave it that way.** The rules in `.claude/rules/` are picked up on their own; anything written here is also read by the separate planning session, which must keep its own role. See workflow.md |
| `next.config.mjs` | Image pipeline sizes, tuned for the future sharp scans rather than today's stand-ins |
| `vercel.json` | Framework, region `fra1`, and the `X-Robots-Tag` noindex headers on `/admin/*` and `/dev` |
| `jsconfig.json` | The `@/*` path alias |
| `eslint.config.mjs` | ESLint flat config — `eslint-config-next/core-web-vitals` plus ignores. Not wired into the build |
| `package.json` | Scripts. `prebuild` regenerates the image manifest; `lint` runs ESLint then the contrast guard; `dev:placeholders` regenerates the `/dev` placeholder images; `seed:local` fills a local database. `pg` is the only runtime dependency beyond Next and React |
| `.env.example` | **Committed template listing every key the project will need**, dummy values only, `DATABASE_URL` first. The real `.env.local` is git-ignored. `DATABASE_URL` and `ADMIN_SESSION_SECRET` are read today; the rest are forecasts |
| `.gitattributes` | Stores every text file as LF regardless of the checkout platform, and marks image/font binaries. Landed in the first commit precisely so it never has to renormalize the tree later |

## i18n — `lib/i18n/`

| File | Role |
|---|---|
| `config.js` | **Single source of truth for languages.** Locale list, default, directions, display names, BCP-47 tags, plus `localeHref` and `replaceLocaleInPath` |
| `dictionaries.js` | `getDictionary(locale)` — server-side loader for the locale JSON |
| `interpolate.js` | Placeholder substitution inside translated strings |
| `locales/he.json`, `locales/en.json` | Every user-facing string. Key sets must match exactly |

## Data — `lib/data/`

| File | Role |
|---|---|
| `works-repository.js` | **The only painting data module pages may import.** Product-shaped, all async, plain objects out. **Reads every painting from Postgres** through `lib/db.js`, converts agorot to shekels in the one place that conversion happens, and requires each read to state whether it is public or admin scope so a draft cannot leak by omission |
| `work-input.js` | **Validates a painting submitted from the admin**, and owns the vocabulary the form builds itself from — including `MANUAL_SALE_CHANNELS`, the channels the artist picks by hand, which excludes `this-site` because checkout writes that one. Pure — no database, no React — and loadable by plain Node, so the rules can be exercised without starting the app. Returns error *codes*, never sentences, because the Hebrew lives in the locale files. Owns `slugify`, which is Unicode-aware so a Hebrew title produces a Hebrew slug, and it is where shekels become agorot on the way in |
| `artworks.js` | **The seed fixture, not storage.** `scripts/seed-local-database.mjs` is its only consumer for data, via `readAllRecords()`. It also holds `WORK_STATUSES`, `WORK_CATEGORIES` and `IMAGE_TYPES` — the repository re-exports the first two, so deleting this file breaks the running site as well as the seed. Off limits outside `lib/data` except that script. Its JSON import carries `with { type: 'json' }` so plain Node can load it — remove that and the seed script breaks. See data-layer.md |
| `image-manifest.json` | Generated. Real pixel dimensions per painting. Never hand-edited. Authoritative over the database's copy while `public/paintings/` exists |

## Lib

| File | Role |
|---|---|
| `lib/format.js` | `formatPrice`, `formatDimensions` — fixed locale tags so server and client agree. Treats `price.amount` as **whole shekels**, which the database does not |
| `lib/auth/password.js` | **The only place a password is hashed or checked.** scrypt from `node:crypto`, no dependency. Writes a self-describing `$scrypt$N=...$salt$key` value so the cost can be raised later without resetting passwords, and compares with `timingSafeEqual`. `needsRehash` is for a login that upgrades a password in passing — nothing calls it yet |
| `lib/auth/session.js` | **The session token, signed and verified.** Pure functions, no cookies and no request — HMAC-SHA256 over `{ sub, exp }`, keyed on `ADMIN_SESSION_SECRET`. Owns the cookie name, the `/admin` path and the 14-day life. The signature is checked before the payload is believed. **The no-session-table trade is written here and in security.md** |
| `lib/auth/admin-session.js` | The request-facing half: `startAdminSession`, `endAdminSession`, `readAdminSession`, `isSignedIn`. The one place the cookie's attributes are set, so setting and clearing cannot disagree. Server-side only — it reads an httpOnly cookie |
| `lib/auth/admin-guard.js` | **The page guard.** `requireAdminSession(path)` — no session, no render: it redirects to the login page carrying where you were going. Signature and expiry only, no database. Also owns `safeReturnTo`, which narrows that path to somewhere inside the admin so it cannot become an open redirect. Its docblock records *why* the guard is per-page rather than in a layout, and both facts were measured |
| `lib/auth/login-throttle.js` | **The sign-in rate limit.** Counters in Postgres, never in memory — Vercel's many short-lived instances make an in-memory counter reset at random. Keyed on address *and* source, with a looser per-source ceiling. Owns the ladder as plain constants, and `blockMinutesFor` is pure. Prunes finished rows on each recorded failure |
| `lib/auth/client-ip.js` | Reads the client address from `x-forwarded-for`. **Rate limiting only, never authorisation** — the header is only trustworthy because Vercel's proxy rewrites it. Unattributable requests share one bucket rather than being waved through |
| `lib/auth/admin-users.js` | **The credential check.** `authenticateAdmin(email, password)` — matched on `lower(email)`, and an unknown address is verified against a decoy hash so that it costs the same as a wrong password. Returns the account or null, never a reason |
| `lib/db.js` | **Owns the database connection.** One pooled `pg` client behind `getPool()`, created on first use and cached on `globalThis` so hot reload cannot leak pools. Throws with instructions when `DATABASE_URL` is missing. Server-side only, and **`works-repository.js` is its only importer**. This module owns the connection and runs no queries of its own; nothing else may create a pool |

## Styles

| File | Role |
|---|---|
| `app/tokens.css` | Every colour, spacing step, type scale and transition. The only place they are defined |
| `app/globals.css` | Reset and base element styles |
| `*.module.css` | Co-located per component |

## Scripts

| File | Role |
|---|---|
| `scripts/generate-image-manifest.mjs` | Reads JPEG/PNG headers in `public/paintings/` and writes the manifest. No dependencies. Wired into `prebuild` |
| `scripts/check-contrast.mjs` | **The palette guard.** Computes WCAG contrast for every permitted pairing and asserts the forbidden ones stay forbidden. Reads values from `app/tokens.css`. Runs with `npm run lint` and on its own as `npm run check:contrast`. Not in the build |
| `scripts/generate-dev-placeholders.mjs` | Writes the three placeholder paintings for `/dev`. Encodes PNG by hand and reads its two colours out of `app/tokens.css`, so the files can never drift from the palette. No dependencies. **Not** wired into `prebuild` — the output is committed |
| `scripts/check-admin-guard.mjs` | **The guard guard.** Fails if any `page.js` under `app/(admin)/admin/(guarded)/` does not import and call `requireAdminSession`. It exists because the guard is called per page, so a new page could silently be added without one. Runs with `npm run lint`, or alone as `npm run check:guard`. Same shape as the contrast guard: no dependencies, prints a table, not in the build |
| `scripts/create-admin-user.mjs` | **The only way an admin account comes into being.** Creates one or replaces its password. The email may be an argument; the password never is — it is typed with the echo off, and the script refuses to run without a terminal so it cannot be piped one either. Unlike the seed script it is **not** local-only, because the real accounts have to be created against Neon eventually; a non-loopback host is named and confirmed instead of refused. Reads the row back and verifies it before reporting success. `npm run admin:create` |
| `scripts/seed-local-database.mjs` | **Local development only.** Fills a local database with the sixteen works from `artworks.js` plus their images. Refuses to run unless `DATABASE_URL` points at loopback, and also refuses on `NODE_ENV=production` or on Vercel — the check runs before any connection opens. Idempotent: works upsert on `slug_en`, images are replaced, all in one transaction. Deliberately **not** in `database/migrations/` and deliberately **unnumbered**. `npm run seed:local` |

## Database — `database/migrations/`

Plain SQL, applied by hand in pgAdmin or with `psql`, in numeric order. No
runner, no ORM, forward-only, ASCII-only. Conventions and the full schema are in
database.md. Which migrations a given database has had applied is not recorded
anywhere — ask the database.

| File | Role |
|---|---|
| `001_create_works_table.sql` | `works`. uuid key, slug per language, the four statuses, `published_at` as a separate axis, optional reduced price, at most one featured work |
| `002_create_work_images_table.sql` | `work_images`. Several rows per work, `image_ref`, pixel dimensions, type, position, optional alt text. At most one `main` per work |
| `003_create_orders_tables.sql` | `orders` and `order_lines`. No quantity column, no repeated work in an order, and an ordered work cannot be deleted |
| `004_create_admin_users_table.sql` | `admin_users`. Hash only, case-insensitive email uniqueness, no role column, no reset fields |
| `005_add_order_buyer_locale.sql` | Adds `orders.buyer_locale`, required, constrained to the locales in `lib/i18n/config.js` |
| `006_add_admin_login_throttle.sql` | `admin_login_attempts`. The sign-in rate limit's counter — the policy 004 deferred. References nothing on purpose, two partial unique indexes, no thresholds in the SQL |

## Assets

| Path | Role |
|---|---|
| `public/dev/` | Generated placeholder paintings for `/dev`, in the three orientations. Regenerate with `npm run dev:placeholders`; never hand-edit |
| `public/paintings/` | The 16 paintings. Each filename stem happens to match a work's `slug_en` — a leftover of how the files were named, **not** a rule, and no longer the work's `id`, which is a uuid. The image's location is `work_images.image_ref` and nothing may derive it from an id. Low-resolution stand-ins — see images.md |
| `public/video/` | Studio footage. `wide-4x3-slow50.mp4` is the homepage hero — 1080×810, slowed, silent; `story-roses-loop.mp4` is staged for the story section. Genuine iPhone originals shot **vertically**, so every crop caps at 1080px wide whatever its ratio — that is the ceiling on hero sharpness until a still photograph exists, and the reason a full-bleed hero was rejected. Working export name; rename when the subject is confirmed |

## Routes — `app/`

Three root layouts in three route groups — public, admin and `/dev` — and
therefore no top-level `app/layout.js`.

| File | Role |
|---|---|
| `proxy.js` | Locale gate at the repo root. Redirects any path without a locale prefix to the default language, so `/` lands on `/he`. Skips `/admin`, `/dev`, `/api`, `/paintings` and anything with a file extension. **A route added outside `[locale]` must be added here too, or it redirects into the locale tree and 404s** |
| `app/(site)/[locale]/layout.js` | Public root layout. **The only place `<html lang dir>` is set.** Owns the header, footer and skip link |
| `app/(site)/[locale]/page.js` | Home — the built prototype. Reads the featured work and the twelve most recent from the repository |
| `app/(site)/[locale]/art/[slug]/page.js` | One painting. Stub body, but real routing: pre-generates every (locale, slug) pair and redirects a slug given in the other language to the canonical one |
| `app/(site)/[locale]/gallery/page.js` | **Built.** The full catalogue, published works only. Filtering is a query parameter and a set of links, not a client component, so it works without JavaScript and each filter is a shareable URL. An unknown category shows everything rather than erroring. No pagination at sixteen works |
| `app/(site)/[locale]/about`, `/contact`, `/cart`, `/checkout`, `/order/[id]`, `/legal/*` | Stubs — heading plus placeholder copy from the dictionary |
| `app/(admin)/admin/layout.js` | Admin root layout. Hebrew pinned via `adminLocale`, `noindex` metadata, its own shell. Reads the session so the shell knows whether to render navigation, which makes the whole admin area dynamic — a cached layout would show one person's navigation to the next |
| `app/(admin)/admin/actions.js` | **The Server Actions for signing in and out.** `'use server'`, so both are POST-only and neither has a URL a credential could sit in. `signIn` returns a flag, never a message — the copy is the component's job. `signOut` is a POST for the same reason a sign-out link would be wrong |
| `app/(admin)/admin/login/page.js` | **Built.** Server component; loads the Hebrew strings and hands them to the form. **Outside `(guarded)/` on purpose** — it is the one admin page a signed-out person must reach, and a guard covering it would redirect it to itself forever. Passes the guard's `next` parameter through to the form |
| `app/(admin)/admin/(guarded)/` | **The route group everything else lives in.** A group, so it changes no URL — `(guarded)/page.js` is still `/admin`. It exists to draw a line the login page sits outside of, and to give `scripts/check-admin-guard.mjs` something to check. Every `page.js` in here calls `requireAdminSession()` first |
| `app/(admin)/admin/(guarded)/page.js` | The dashboard. Stub, guarded |
| `app/(admin)/admin/(guarded)/works/new/page.js` | **Built.** Adding a painting. Builds every option list from the exported constants so the form cannot offer a value the database will refuse |
| `app/(admin)/admin/(guarded)/works/[id]/page.js` | **Built.** Editing a painting, and where publishing and unpublishing happen. Renders the same form as the new-work page, with the action bound to this work's id server-side. The lookup runs **after** the guard, so an unauthenticated request never reaches the database and cannot tell an existing id from a missing one. Its `generateMetadata` carries no record data — the work names itself in the body instead |
| `app/(admin)/admin/(guarded)/orders`, `/orders/[id]` | Stubs, guarded |
| `app/(dev)/dev/layout.js` | **Third root layout.** English, LTR, `noindex`. Exists so `/dev` sits outside the locale structure and cannot inherit the public shell |
| `app/(dev)/dev/page.js` | **The design system, rendered** — every colour on the surface it is used on, the spacing and radius scales, the interactive states, and the real artwork component across all three orientations and all four statuses. Needs no database and no real content. A permanent developer tool |
| `app/(dev)/dev/page.module.css` | Chrome for the above. `.buttonHovered` and `.buttonFocused` mirror declarations in `ButtonLink.module.css` and `globals.css` so both states can be seen at rest — keep them in step |
| `app/api/health/route.js` | Liveness check; also proves the repository is reachable from a route handler. It calls `getAllWorks()`, so it now checks the **database** too — the quickest way to tell whether `DATABASE_URL` and the local Postgres are working, and it fails when they are not |
| `app/robots.js` | Disallows `/admin`, `/dev` and `/api/` |
| `app/fonts.js` | The two faces, loaded once via `next/font` and exposed as CSS variables |

## Components — `components/`

| File | Role |
|---|---|
| `layout/SiteHeader.js` | Public top nav: wordmark, three links, switcher, cart |
| `layout/SiteFooter.js` | Social, contact, legal links. Takes `year` as a prop — never calls `new Date()` in render |
| `layout/LanguageSwitcher.js` | **The first client component.** Needs `usePathname()` to rewrite the current URL |
| `layout/CartLink.js` | Header cart entry point. Inline SVG, no cart state yet |
| `layout/AdminShell.js` | Admin chrome. No header, footer, switcher or cart. **Signed in:** the working links plus the sign-out control, which is a form POST rather than a link so nothing can trigger it by prefetching or from another page. **Signed out:** no navigation at all, because every link would lead somewhere the guard bounces back. Not a guard itself |
| `admin/AdminWorkForm.js` | **The fourth client component**, and it serves **both** the new-work and edit pages. The sale-channel question is asked only when the status is `sold`, and offers only the channels she picks by hand — the action arrives as a prop rather than being imported, so a second copy cannot drift from this one. `mode` picks the wording; `slugsLocked` makes a published work's address read-only. The add-a-painting form: bilingual fields, the closed sets as selects built from the exported constants, the web address folded into a `<details>`, and a dashed band saying image upload is not built. Re-renders with errors marked *and the typed values kept* — losing a filled form to one bad field is how a non-technical person gives up |
| `admin/AdminLoginForm.js` | **The third client component**, and the only one in the admin. `useActionState` so a failed attempt is reported in place rather than through a URL. Both inputs are `dir="ltr"` — Latin strings inside an RTL page. Every string arrives as a prop |
| `home/Hero.js` | Section 1 — **studio footage of the artist**, not a painting, plus one positioning line. Server-renders the poster still as the LCP element; the loop is layered over it by `HeroVideo`. Frame is a cropping window: 16/9 on a phone, 2.35/1 from 48rem. `padding-bottom: 0` on purpose — the grid `<Section>` below already owns that gap |
| `home/HeroVideo.js` | **The second client component**, and the only one above the fold. Renders the `<video>` alone, deferred until the page is quiet, skipped under reduced-motion or Save-Data. The poster never depends on it |
| `home/WorksGrid.js` | Section 2 — twelve works plus the link to the gallery |
| `home/PromisesRow.js` | Section 3 — the four promises, read as an array from the dictionary |
| `home/StorySection.js` | Section 4 — artist photo slot (a labelled empty frame until one is supplied), paragraph, link to About |
| `ui/ArtworkFrame.js` | **Owns the never-crop rule.** Fixed-size frame, painting fitted inside an absolutely-positioned mat. Two tones: mounted, and `bare` for the hero, which takes a deeper shadow because nothing else holds its edge |
| `ui/ArtworkCard.js` | A framed work plus title, medium and dimensions, price and status. Draws the price/status separator only when a badge actually renders |
| `ui/StatusBadge.js` | Renders a badge for **two** of the four statuses — reserved and sold, both on the clay tint. Available and not-for-sale return `null` |
| `ui/statusPresentation.js` | **The four-state table**, read by both `StatusBadge` and `Price` so the badge and the price treatment cannot disagree. Add a status here, never in a component |
| `ui/Price.js` | Formatted amount plus the visible "sample price" marker while data is placeholder. Also carries the half of status the price expresses: struck through when sold, replaced by words when not for sale |
| `ui/Container.js`, `ui/Section.js`, `ui/SectionHeading.js`, `ui/ButtonLink.js` | Layout and text primitives |
| `ui/StubPage.js` | The shared body of every not-yet-built page |

## Not built yet

Cart and checkout logic, gallery filters and pagination, the artwork page body,
Cloudinary, sitemap, OG images and hreflang tags. Add them here as they land.

The admin is guarded, but **only where it renders**. No admin mutation exists
yet beyond signing in and out; the first one that does has to check the session
itself. See security.md.

**The site reads Postgres.** Every page goes through `works-repository.js`, which
queries the database through `lib/db.js`; `artworks.js` is now only the seed
fixture and the home of the shared constants. What the swap had to reconcile —
minor units, the uuid key, the publication filter, medium — is in data-layer.md,
and those reconciliations are live code now rather than a plan.

Development runs against a local Postgres. **Neon is still not connected**, so
there is no deployed database behind any of this — see database.md.

When the sitemap lands it needs no `/dev` exclusion: generated from the locale
list and the works repository, as seo.md requires, it cannot emit a URL outside
`app/(site)/[locale]`.
