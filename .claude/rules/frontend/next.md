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
appearing in the URL. They exist here to give the site and the admin **two
separate root layouts**, which is why there is no top-level `app/layout.js`.
Each root layout renders its own `<html>` and `<body>`.

A `layout.js` wraps everything beneath it and does not re-render on navigation
between its children. `app/(site)/[locale]/layout.js` is the public root layout:
it owns `<html lang dir>` *and* the header and footer, because with route groups
they are the same file. The admin's root layout has neither.

Navigating between the two root layouts is a full page load, not a client
transition. That is fine — nobody crosses from the shop into the admin mid-session.

**Next 16 renamed `middleware` to `proxy`.** The file is `proxy.js` at the repo
root and the exported function is `proxy`. It runs on the Node runtime; the edge
runtime is not available there.

## Server and client components

Components are **server components by default**: they run on the server, never
ship to the browser, and can read data directly. A server component cannot use
state, effects, or event handlers.

A component that needs interactivity is marked `'use client'` at the top of the
file. Keep those small and push them to the leaves — a `'use client'` on a page
drags its whole subtree into the browser.

On this site, almost everything is a server component. The genuine client
components are the ones with interaction: the mobile navigation toggle, the
language switcher, gallery filters, the cart, and image zoom on an artwork page.
A grid of paintings is not interactive and must not be a client component.

**Never fetch painting data in a client component.** Resolve it on the server and
pass plain serializable props down. The same applies to dictionaries — see i18n.md.

## Data fetching

Server components read through `lib/data/works-repository.js` directly, with
`await`. No fetch call to your own API, no loading spinner, no `useEffect`.

Routes with dynamic params pre-generate them from the repository so painting
pages are static and fast.

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
