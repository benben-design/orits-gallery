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
| `vercel.json` | Framework, region `fra1`, and the `X-Robots-Tag` noindex header on `/admin/*` |
| `jsconfig.json` | The `@/*` path alias |
| `eslint.config.mjs` | ESLint flat config — `eslint-config-next/core-web-vitals` plus ignores. Not wired into the build |
| `package.json` | Scripts. `prebuild` regenerates the image manifest |

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

## Assets

| Path | Role |
|---|---|
| `public/paintings/` | The 15 paintings. Filename stem is the work's `id` and English slug. Low-resolution stand-ins — see images.md |

## Routes — `app/`

Two root layouts in two route groups, and therefore no top-level `app/layout.js`.

| File | Role |
|---|---|
| `proxy.js` | Locale gate at the repo root. Redirects any path without a locale prefix to the default language, so `/` lands on `/he`. Skips `/admin`, `/api`, `/paintings` and anything with a file extension |
| `app/(site)/[locale]/layout.js` | Public root layout. **The only place `<html lang dir>` is set.** Owns the header, footer and skip link |
| `app/(site)/[locale]/page.js` | Home — the built prototype. Reads the featured work and the twelve most recent from the repository |
| `app/(site)/[locale]/art/[slug]/page.js` | One painting. Stub body, but real routing: pre-generates every (locale, slug) pair and redirects a slug given in the other language to the canonical one |
| `app/(site)/[locale]/gallery`, `/about`, `/contact`, `/cart`, `/checkout`, `/order/[id]`, `/legal/*` | Stubs — heading plus placeholder copy from the dictionary |
| `app/(admin)/admin/layout.js` | Admin root layout. Hebrew pinned via `adminLocale`, `noindex` metadata, its own shell |
| `app/(admin)/admin/page.js` | The dashboard. Stub |
| `app/(admin)/admin/login`, `/works/new`, `/works/[id]`, `/orders`, `/orders/[id]` | Stubs. `/works/[id]` does a real repository lookup by id |
| `app/api/health/route.js` | Liveness check; also proves the repository is reachable from a route handler |
| `app/robots.js` | Disallows `/admin` and `/api/` |
| `app/fonts.js` | The two faces, loaded once via `next/font` and exposed as CSS variables |

## Components — `components/`

| File | Role |
|---|---|
| `layout/SiteHeader.js` | Public top nav: wordmark, three links, switcher, cart |
| `layout/SiteFooter.js` | Social, contact, legal links. Takes `year` as a prop — never calls `new Date()` in render |
| `layout/LanguageSwitcher.js` | **The only client component.** Needs `usePathname()` to rewrite the current URL |
| `layout/CartLink.js` | Header cart entry point. Inline SVG, no cart state yet |
| `layout/AdminShell.js` | Admin chrome. No header, footer, switcher or cart |
| `home/Hero.js` | Section 1 — the featured landscape-format work and one positioning line. Static, never a carousel |
| `home/WorksGrid.js` | Section 2 — twelve works plus the link to the gallery |
| `home/PromisesRow.js` | Section 3 — the four promises, read as an array from the dictionary |
| `home/StorySection.js` | Section 4 — artist photo slot (a labelled empty frame until one is supplied), paragraph, link to About |
| `ui/ArtworkFrame.js` | **Owns the never-crop rule.** Fixed-size frame, painting fitted inside an absolutely-positioned mat |
| `ui/ArtworkCard.js` | A framed work plus title, price and status |
| `ui/StatusBadge.js` | The four-value status. Colourless — weight and strikethrough only |
| `ui/Price.js` | Formatted amount plus the visible "sample price" marker while data is placeholder |
| `ui/Container.js`, `ui/Section.js`, `ui/SectionHeading.js`, `ui/ButtonLink.js` | Layout and text primitives |
| `ui/StubPage.js` | The shared body of every not-yet-built page |

## Not built yet

The database layer, admin auth, cart and checkout logic, gallery filters and
pagination, the artwork page body, Cloudinary, sitemap, OG images and hreflang
tags. Add them here as they land.
