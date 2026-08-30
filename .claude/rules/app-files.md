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
| `package.json` | Scripts. `prebuild` regenerates the image manifest; `lint` runs ESLint then the contrast guard; `dev:placeholders` regenerates the `/dev` placeholder images |
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
| `works-repository.js` | **The only painting data module pages may import.** Product-shaped, all async, plain objects out |
| `artworks.js` | Storage. The local stand-in for the works table. Off limits outside `lib/data` |
| `image-manifest.json` | Generated. Real pixel dimensions per painting. Never hand-edited |

## Lib

| File | Role |
|---|---|
| `lib/format.js` | `formatPrice`, `formatDimensions` — fixed locale tags so server and client agree |

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

The database layer, admin auth, cart and checkout logic, gallery filters and
pagination, the artwork page body, Cloudinary, sitemap, OG images and hreflang
tags. Add them here as they land.

When the sitemap lands it needs no `/dev` exclusion: generated from the locale
list and the works repository, as seo.md requires, it cannot emit a URL outside
`app/(site)/[locale]`.
