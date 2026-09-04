# Code Style

- ES modules everywhere — `"type": "module"` in `package.json`
- JavaScript, not TypeScript. Use JSDoc on exported functions where the shape is
  not obvious, as the repository and format modules already do
- Import from the project root with the `@/` alias, configured in `jsconfig.json`
- Use clear section-divider comments to separate logical blocks in longer files
- Cross-component callbacks follow the `on<Event>` naming convention
- No state management library — local React state, lifted to the nearest common
  ancestor. **A React context is not a state management library**, and the cart
  is the one thing that needed one: its state is shared by the header button,
  the buy button on an artwork page and the drawer, whose nearest common
  ancestor is the public *layout* — a server component, which cannot hold
  state. `components/cart/cart-context.js` is the whole of it, and it pulls in
  no dependency. Reach for one only when the ancestor genuinely cannot hold the
  state, not when passing a prop down two levels feels tedious
- Comment the *why*, not the *what*. The existing files in `lib/` set the
  standard: they explain the rule a future reader would otherwise break
- Exported constants over repeated string literals — `WORK_STATUSES`,
  `WORK_CATEGORIES`, `IMAGE_TYPES` exist for this reason
- Keep dependencies minimal. Prefer a platform feature or twenty lines over a
  package. `scripts/generate-image-manifest.mjs` reads JPEG headers by hand
  rather than pulling in an image library — that is the house style

## The one icon dependency

**`lucide-react` is here, and it reverses an earlier decision.** The header's
cart glyph used to be hand-written inline SVG with a comment saying the site
pulls in no icon package. That comment is gone, and this is what replaced it.

The call was the owner's, and it is defensible on its own terms: lucide is
stroke-based on a 24px grid with round caps, which is the drawing the hand-made
glyph already was, and one icon system beats two the moment a second icon is
needed. Icons are set at `strokeWidth={1.5}` to sit with the site's hairlines
rather than lucide's default 2.

Two things to know before using it:

- **Every lucide icon is a client component.** Its base `Icon` carries
  `"use client"` because it reads a React context. That costs nothing where it
  is used today — `LanguageSwitcher` already puts a client boundary in the
  header, so React is on every public page regardless — but it is a real
  consideration anywhere else. **Do not put one inside `ArtworkCard` or
  `ArtworkFrame`**: that would drag the gallery grid into the browser, which
  frontend/next.md forbids for its own reasons.
- **This is not a licence for a component library.** The rule above still
  stands, and "no framework, no component library" in project.md is unchanged.
  An icon set is a set of drawings; a component library is a set of decisions.

## What the linter enforces

`npm run lint` (setup.md) mechanically checks a handful of conventions that are
otherwise easy to carry over wrongly from plain React:

- `next/image` rather than a bare `<img>` — see images.md
- `next/link` rather than an `<a>` for internal navigation — see frontend/next.md
- an `alt` on every image — alt text is bilingual content, see images.md
- no synchronous scripts, no manual `<head>` tags, no server-only code reaching a
  client component

`npm run lint` also runs four project-specific guards after ESLint: palette
contrast, the admin guard, the sitemap, and image cropping. The last of those is
the one to know about — `check:crop` asserts that the image loader never asks
the host to crop a painting, which is the only rule on this project that can
break without anything on the page looking wrong. See images.md.

Those rules are stated where they belong, in the files above; the linter is
enforcement, not the source of truth. It is advisory tooling — it does not run in
the build and cannot block a deploy — so a clean `npm run lint` is a signal, not
a gate.
