# Next.js Architecture

The owner learned React, not Next. Core React carries over unchanged; what is
new is file-based routing, the server/client component split, and fetching data
on the server. When you use something Next-specific, say so in one line.

## Routing

Routing is the folder structure under `app/`. A folder is a URL segment; a
`page.js` inside it is the page. There is no router configuration file and no
route table to keep in sync. Files are `.js`, not `.jsx` — the project uses no
TypeScript and no JSX-specific extension.

- `app/(site)/[locale]/` — the bracket makes the segment a parameter. Every
  public page lives under it, so every public page receives the locale.
- `app/(site)/[locale]/art/[slug]/` — one route serving every painting.
- `app/(admin)/admin/` — deliberately outside `[locale]`. The admin is Hebrew
  only.

The parenthesised folders are **route groups**: they organise files without
appearing in the URL. They do two jobs here.

The outer ones give the site, the admin and the design system (`/admin/dev`) **separate root layouts**,
which is why there is no top-level `app/layout.js`. Each root layout renders its
own `<html>` and `<body>`.

`app/(admin)/admin/(guarded)/` is the second job: a group used purely to draw a
line through a section of the tree. `(guarded)/page.js` is still `/admin` — the
URL is untouched — but the login page sits outside the group and everything
inside it is guarded. This is the idiomatic way to say "these routes share a
property" without inventing a URL segment for it.

A `layout.js` wraps everything beneath it and does not re-render on navigation
between its children. `app/(site)/[locale]/layout.js` is the public root layout:
it owns `<html lang dir>` *and* the header and footer, because with route groups
they are the same file. The admin's root layout has neither.

Navigating between the two root layouts is a full page load, not a client
transition. That is fine — nobody crosses from the shop into the admin mid-session.

**Next 16 renamed `middleware` to `proxy`.** The file is `proxy.js` at the repo
root and the exported function is `proxy`. It runs on the Node runtime; the edge
runtime is not available there.

Its matcher **excludes `/admin` deliberately**, and the admin guard is therefore
not there — it is called by each guarded page. Two facts decided that shape, and
both were measured rather than assumed:

- **A layout cannot know which page was requested.** It receives
  `{ children, params }`, `params` is empty for a group, and `headers()` on a
  document request carries no path. So a layout guard can only ever send people
  to the dashboard, never back to the page they asked for.
- **When a layout and its page both redirect, the layout's redirect wins.** A
  layout guard does not coexist with a page guard that knows better; it
  overrides it.

If you ever need the requested path in a server component, this is the reason
you will not find it — resolve it where it is known, or pass it down.

## Server and client components

Components are **server components by default**: they run on the server, never
ship to the browser, and can read data directly. A server component cannot use
state, effects, or event handlers.

A component that needs interactivity is marked `'use client'` at the top of the
file. Keep those small and push them to the leaves — a `'use client'` on a page
drags its whole subtree into the browser.

On this site, almost everything is a server component. The genuine client
components are the ones with interaction: the primary navigation (for its
current-page mark — on a phone it is a visible row, not a toggle), the
language switcher, gallery filters, the cart, and image zoom on an artwork page.
A grid of paintings is not interactive and must not be a client component.

**Never fetch painting data in a client component.** Resolve it on the server and
pass plain serializable props down. The same applies to dictionaries — see i18n.md.

## Data fetching

Server components read through `lib/data/works-repository.js` directly, with
`await`. No fetch call to your own API, no loading spinner, no `useEffect`.

Routes with dynamic params pre-generate them from the repository so painting
pages are static and fast.

## Caching

Nothing here cached anything for a long time, so every visit queried Postgres.
That became worth fixing when the production database moved to a plan whose
compute sleeps after five minutes of quiet: a visitor can pay a wake-up on top
of the query. Two shapes are in use, and **which one a page gets is decided by
whether it reads `searchParams`, not by preference**.

- **A page that takes only `params` gets `export const revalidate`.** It is
  prerendered per locale and rebuilt on a window. The homepage is this.
- **A page that reads `searchParams` renders per request whatever window is
  declared on it**, so a `revalidate` export there is inert and misleading.
  Cache the *data read* instead, with `unstable_cache` in the repository. The
  gallery is this, because its category filter is a query parameter and
  categories staying a filter rather than separate routes is a settled product
  decision.

Three rules around it:

- **Never cache a read that is shared with something that must not be cached.**
  The gallery's cached read is `getGalleryWorks`, not a cache on
  `getAllWorks`, which `app/sitemap.js` also calls; wrapping the shared
  function would cache every caller at once, silently, including the next one
  added for a reason that needs a live read. (`/api/health` used to be that
  caller; since 29-09-2026 it touches no database.) Add a separate cached read;
  do not wrap the shared one.
- **Never cache anything the cart or checkout reads.** A cart is a wish, not a
  hold, and its whole correctness is that every work is re-read. See commerce.md.
- **Every write invalidates through `lib/revalidate.js`**, never by calling
  `revalidatePath` or `revalidateTag` directly. There are two caches with two
  mechanisms and clearing one is a half-stale site.

`unstable_cache` persists into `.next/cache`, so entries survive a server
restart. That is right in production and surprising in a test: a "first" request
after a restart can be served from a previous run's cache.

## Hydration

Server and browser must render identically. The usual causes of mismatch, all of
which are avoidable here:

- Formatting with the machine's default locale — use `lib/format.js`.
- Rendering anything derived from `new Date()` at render time.
- Reading `window`, `localStorage` or `document` during render rather than in an
  effect.
- Branching on viewport width in JavaScript. Do responsive work in CSS.

A hydration warning in the console is a bug to fix, not noise to ignore.

## Component organisation

`components/` is grouped by area — shared layout, homepage sections, generic UI.
Each homepage section is its own component so the page reads as its section
order.

Keep components focused and small. Callbacks use the `on<Event>` naming
convention. No state management library: local state, lifted to the nearest
common ancestor when shared.

## Links and navigation

Always use Next's link component for internal navigation, and always build the
href with `localeHref`. A bare `<a>` to an internal route throws away client-side
navigation and reloads the page.
