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
| `.env.example` | **Committed template listing every key the project will need**, dummy values only, `DATABASE_URL` first. The real `.env.local` is git-ignored. Only `DATABASE_URL` is read by anything today; the rest are forecasts |
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
| `works-repository.js` | **The only painting data module pages may import.** Product-shaped, all async, plain objects out. Still reads `artworks.js` — nothing here queries Postgres yet |
| `artworks.js` | Storage, and now **also the seed fixture**. Off limits outside `lib/data` except `scripts/seed-local-database.mjs`. Its JSON import carries `with { type: 'json' }` so plain Node can load it — remove that and the seed script breaks. See data-layer.md |
| `image-manifest.json` | Generated. Real pixel dimensions per painting. Never hand-edited. Authoritative over the database's copy while `public/paintings/` exists |

## Lib

| File | Role |
|---|---|
| `lib/format.js` | `formatPrice`, `formatDimensions` — fixed locale tags so server and client agree. Treats `price.amount` as **whole shekels**, which the database does not |
| `lib/db.js` | **Owns the database connection.** One pooled `pg` client behind `getPool()`, created on first use and cached on `globalThis` so hot reload cannot leak pools. Throws with instructions when `DATABASE_URL` is missing. Server-side only — **nothing imports it yet** |

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

## Assets

| Path | Role |
|---|---|
| `public/dev/` | Generated placeholder paintings for `/dev`, in the three orientations. Regenerate with `npm run dev:placeholders`; never hand-edit |
| `public/paintings/` | The 16 paintings. Filename stem is the work's `id` and English slug. Low-resolution stand-ins — see images.md |
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
| `app/(site)/[locale]/gallery`, `/about`, `/contact`, `/cart`, `/checkout`, `/order/[id]`, `/legal/*` | Stubs — heading plus placeholder copy from the dictionary |
| `app/(admin)/admin/layout.js` | Admin root layout. Hebrew pinned via `adminLocale`, `noindex` metadata, its own shell |
| `app/(admin)/admin/page.js` | The dashboard. Stub |
| `app/(admin)/admin/login`, `/works/new`, `/works/[id]`, `/orders`, `/orders/[id]` | Stubs. `/works/[id]` does a real repository lookup by id |
| `app/(dev)/dev/layout.js` | **Third root layout.** English, LTR, `noindex`. Exists so `/dev` sits outside the locale structure and cannot inherit the public shell |
| `app/(dev)/dev/page.js` | **The design system, rendered** — every colour on the surface it is used on, the spacing and radius scales, the interactive states, and the real artwork component across all three orientations and all four statuses. Needs no database and no real content. A permanent developer tool |
| `app/(dev)/dev/page.module.css` | Chrome for the above. `.buttonHovered` and `.buttonFocused` mirror declarations in `ButtonLink.module.css` and `globals.css` so both states can be seen at rest — keep them in step |
| `app/api/health/route.js` | Liveness check; also proves the repository is reachable from a route handler |
| `app/robots.js` | Disallows `/admin`, `/dev` and `/api/` |
| `app/fonts.js` | The two faces, loaded once via `next/font` and exposed as CSS variables |

## Components — `components/`

| File | Role |
|---|---|
| `layout/SiteHeader.js` | Public top nav: wordmark, three links, switcher, cart |
| `layout/SiteFooter.js` | Social, contact, legal links. Takes `year` as a prop — never calls `new Date()` in render |
| `layout/LanguageSwitcher.js` | **The only client component.** Needs `usePathname()` to rewrite the current URL |
| `layout/CartLink.js` | Header cart entry point. Inline SVG, no cart state yet |
| `layout/AdminShell.js` | Admin chrome. No header, footer, switcher or cart |
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

Admin auth, the admin accounts themselves, cart and checkout logic, gallery
filters and pagination, the artwork page body, Cloudinary, sitemap, OG images
and hreflang tags. Add them here as they land.

The database schema exists and the connection module exists, but **no
application code reads Postgres**: every page still goes through
`works-repository.js` into `artworks.js`, and `lib/db.js` has no importers.
Swapping the repository over is the next milestone, and data-layer.md lists what
it has to reconcile.

When the sitemap lands it needs no `/dev` exclusion: generated from the locale
list and the works repository, as seo.md requires, it cannot emit a URL outside
`app/(site)/[locale]`.
