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
  rather than pulling in an image library — that is the house style.
  **`server-only` is the one exception taken on purpose** (29-09-2026): a
  two-file marker from the React team with no dependencies, and the mechanism
  Next documents for making a client import of a server module fail the build.
  Twenty lines could not replace it, because what it does is resolve
  differently per React environment

## The one icon dependency

**`lucide-react` is here, and it reverses an earlier decision.** The header's
cart glyph used to be hand-written inline SVG with a comment saying the site
pulls in no icon package. That comment is gone, and this is what replaced it.

The call was the owner's, and it is defensible on its own terms: lucide is
stroke-based on a 24px grid with round caps, which is the drawing the hand-made
glyph already was, and one icon system beats two the moment a second icon is
needed. Icons are set at `strokeWidth={1.5}` to sit with the site's hairlines
rather than lucide's default 2.

## Buttons carry icons

**Every button on the site pairs a lucide glyph with its label**, and an
icon-only button carries the label as `aria-label` instead. Set at
`strokeWidth={1.5}`, at 14px beside small text, 16px in navigation and 18px on a
full-size control.

One glyph means one action, everywhere it appears:

| Action | Icon | Where |
|---|---|---|
| Add to cart | `ShoppingBag` | the artwork page, and the header's cart |
| Buy now / checkout | `CreditCard` | the artwork page, the drawer, `/cart` |
| Remove a work | `Trash2` | the drawer, the cart line, the missing-works control |
| Close a panel | `X` | the drawer and the full-screen view, icon-only |
| View a painting full screen | `Maximize2` | the artwork page, beneath the frame on hover and focus |
| Previous / next image | `ChevronLeft` / `ChevronRight` | the full-screen view, icon-only — swapped in Hebrew, because they point the way the reading goes |
| Sign in / out | `LogIn` / `LogOut` | the admin |
| Save | `Save` | the work form |
| Translate / approve | `Languages` / `Check` | the work form |
| Stop / play the hero loop | `Pause` / `Play` | the homepage hero, over the footage |
| Try again | `RotateCcw` | the public error page |
| Call / write | `Phone` / `Mail` | the contact page's rows — beside the label, not as a button; Instagram and Facebook carry none |
| Star for the homepage | `Star` (filled when on) | each row of the admin's works list, icon-only |
| Message on WhatsApp | `WhatsAppIcon` (not lucide — see below) | the floating button in the corner of every public page, icon-only; and the question about one painting on its page, with words |

**Brand logos are the one exception to "one icon system".** lucide dropped
every brand mark in its 1.0 release, so there is no WhatsApp to import.
`components/ui/WhatsAppIcon.js` is Tabler Icons' outline version (MIT), chosen
because Tabler draws the way lucide does — a 24px grid, round caps, a stroke —
so at `strokeWidth={1.5}` it reads as one set with the cart's bag. It used to sit beside that bag in the header; it is the floating contact button's glyph now, at 26px — larger than anything else here because it is the whole of that control rather than a mark beside a label. Take the
next brand mark from the same place, and draw it in ink: a brand's own colour
in the chrome is a second accent.

**The play triangle does not flip in Hebrew.** i18n.md names it among the icons
that carry no direction — unlike a "back" chevron — so the control mirrors to
the other corner while the glyph inside it stays as drawn.

**`X` means close and nothing else.** Removal was `X` until the drawer's close
control lost its label and became the glyph alone — one symbol cannot mean both
"shut this panel" and "delete this thing" on the same screen.

Where a label is underlined, **the underline moves onto a `<span>` around the
words**: a rule running under an icon reads as a mistake.

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

`npm run lint` also runs six project-specific guards after ESLint: palette
contrast, the admin guard, the sitemap, image cropping, page headings, and
locale strings — the last fails on a string nothing renders, so a copy key added
in a change must be rendered in the same change. The last of those is
the one to know about — `check:crop` asserts that the image loader never asks
the host to crop a painting, which is the only rule on this project that can
break without anything on the page looking wrong. See images.md.

Those rules are stated where they belong, in the files above; the linter is
enforcement, not the source of truth. It is advisory tooling — it does not run in
the build and cannot block a deploy — so a clean `npm run lint` is a signal, not
a gate.
