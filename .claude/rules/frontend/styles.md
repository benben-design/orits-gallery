# Styles

## The aesthetic: a gallery wall

Neutral warm white. Generous white space. Quiet typography. Minimal borders and
rules. The paintings are highly saturated and colourful; the site must not
compete with them.

**There is exactly one accent, and it is already chosen: `--accent`, a deep
terracotta.** It is reserved for interactive things — links, buttons, active
state — and for nothing else. Do not add a second accent, and do not use the
accent decoratively: a hue used as ornament next to one of these paintings
fights it, and the painting loses. Everything that is not interactive draws
from the surface, text and line tokens, which are warm neutrals.

`--surface-tint` is the one non-neutral surface. It is a background only, never
a text colour — see the measured note in `app/tokens.css`.

The visual reference is gitahomedesign.co.il — the artist's own store — with two
deliberate departures noted in project.md.

## The palette

Defined in `app/tokens.css`. One light theme; no dark mode, no `data-theme`.

| Token | Value | Role |
|---|---|---|
| `--surface-wall` | `#F0E7D2` | The page. The wall |
| `--surface-mat` | `#FBFAF7` | Cards, artwork mats, panels |
| `--surface-sunk` | `#EBDFC1` | Inset areas: footer, filter bar |
| `--surface-tint` | `#EBD9CE` | Clay tint. Background only |
| `--text-primary` | `#2C2723` | Body and headings. Warm near-black — never `#000` |
| `--text-muted` | `#6B6058` | Medium, dimensions, captions |
| `--text-on-accent` | `#FBF7F3` | Text on the accent |
| `--line` | `#DED5C9` | Hairlines, dividers |
| `--line-strong` | `#C9BCA9` | Emphasised borders, input outlines |
| `--accent` | `#8C4A33` | Deep terracotta. Links, buttons, active state |
| `--accent-hover` | `#743C29` | Hover and pressed |
| `--status-sold-bg` / `--status-sold-text` | `#EBD9CE` / `#6B3A28` | The sold badge |

### The three rules that get broken

1. **Only `--accent` may carry terracotta text.** Never introduce a softer one
   for type, however much better it looks alone — the hue runs out of contrast
   almost immediately, and a soft terracotta on the wall fails AA.
2. **On `--surface-tint`, text is `--text-primary` or `--status-sold-text`.**
   Nothing else. `--text-muted` there is 4.46:1 and is forbidden.
3. **A painting is never cropped.** Fixed container, painting fitted inside at
   its own ratio, centred. `object-fit: cover` on a work is a bug. See images.md.

`npm run check:contrast` enforces 1 and 2 — every permitted pairing must clear
AA, and the forbidden ones must keep failing. Run it after touching a colour.

## Tokens

All colours, spacing, typography, and transitions live in `app/tokens.css`. It is
the only place those values are defined, so the whole site can be re-themed from
one file.

Never write a raw colour or a magic pixel value in a component stylesheet. If a
value is missing, add a token.

There are three content widths, and picking the wrong one is the usual mistake:
`--page-max` is the page frame, `--measure` is running prose, and
`--measure-list` is a list of items with a picture in it — the cart. The last
was added rather than hard-coded, and for a measured reason: across the full
page width the cart's remove control ended up about forty characters from the
painting it removes, with nothing in between, and four rows of that read as a
spreadsheet missing most of its columns.

One button treatment was added with the cart, and it is the site's whole
emphasis scale rather than a new style: `ButtonLink`'s hairline outline carries
"see more of this", and a **filled `--accent`** carries "this is the thing to do
here". There is only ever one of those in view — the buy button on an artwork
page, the checkout button in the cart. `--text-on-accent` on `--accent` is one
of the pairings `npm run check:contrast` asserts, so this is a permitted use
rather than a new liberty with the accent: a purchase is the most interactive
thing on the site, and the accent is reserved for interactive things.

`--shadow-drawer` is the third and last shadow, for the cart panel, which sits
over the page rather than on the wall. It is deliberately **not directional**:
an offset shadow would have to be flipped between Hebrew and English, and a
soft even one reads the same from either edge. Same ink as the frame shadows,
so nothing on the site casts a differently-coloured one.

**The cart panel is pinned with `inset-inline-end`**, so it arrives from the
left in Hebrew and the right in English from one rule. It hides by translating
by its own width in the direction it is pinned to, which is the one place a
logical property does not exist — `--drawer-hidden-shift` is set per `[dir]`
and is the only direction-conditional value in the stylesheets. Everything else
still falls out of logical properties, as i18n.md requires.

`app/globals.css` holds the reset and base element styles. Nothing component-
specific belongs there.

## Component styles

Co-located CSS Modules — one `*.module.css` next to each component. No global
class names, no framework, no component library, no CSS-in-JS.

## Writing direction

The site is right-to-left by default. Every rule in the CSS section of i18n.md
applies here: logical properties rather than left/right, `text-align: start`,
no hardcoded direction. This is the most common source of layout bugs on this
project — a rule written with `margin-left` will look correct in English and
wrong in Hebrew, which is the language most visitors will see.

## Responsive

Mobile first. Most visitors arrive on a phone from Instagram or WhatsApp.
Responsive behaviour is CSS — container widths, grid column counts, and media
queries — never JavaScript measuring the viewport.

## Typography

Two faces at most: one for headings, one for body. Both must carry Hebrew and
Latin glyphs properly — a font that looks elegant in English and renders Hebrew
badly is disqualified regardless of how it looks in a mockup. Check Hebrew before
committing to a face.

Loaded once, through Next's font handling. Not imported ad hoc in a component.
