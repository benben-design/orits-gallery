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

`--surface-tint` and `--surface-band` are the two clay surfaces, both from the
terracotta family and both backgrounds only, never text colours — see the
measured notes in `app/tokens.css`. The band is the header's ground and taken
from the artist's own shop; nothing else uses it yet.

**Inside the header three tokens are redefined**, because their values assume the
wall: `--text-muted` becomes `--text-muted-on-band` (plain muted fails AA on the
band), and `--line` / `--line-strong` become `--line-on-band` (both are lighter
than the band). `SiteHeader.module.css` does it once, so nothing inside needs to
know what it sits on. Terracotta *text* on the band also fails; the current page
is marked there with an accent hairline, which is a non-text indicator.

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
| `--surface-tint-hover` | `#D4C3B9` | The clay pressed — hover and active for a control filled with it |
| `--surface-band` | `#DDCABD` | The header. The dusty clay of the artist's own shop, lightened. Background only |
| `--text-muted-on-band` | `#574D46` | The secondary ink on the band, where `--text-muted` fails |
| `--line-on-band` | `#C7AF9F` | Hairlines and hover underlines on the band |
| `--text-primary` | `#2C2723` | Body and headings. Warm near-black — never `#000` |
| `--text-muted` | `#6B6058` | Medium, dimensions, captions |
| `--text-on-accent` | `#FBF7F3` | Text on the accent |
| `--line` | `#DED5C9` | Hairlines, dividers |
| `--line-strong` | `#C9BCA9` | Emphasised borders, input outlines |
| `--accent` | `#8C4A33` | Deep terracotta. Links, buttons, active state |
| `--accent-hover` | `#743C29` | Hover and pressed |
| `--status-sold-bg` / `--status-sold-text` | `#EBD9CE` / `#6B3A28` | The sold badge |
| `--surface-viewer` | `#151515` | The full-screen view's ground. **The one dark surface, and neutral on purpose** |
| `--text-on-viewer` / `--text-muted-on-viewer` | `#ECEAE6` / `#A3A09B` | Its two inks: 15.20:1 and 7.01:1 |

**The full-screen view is the one place the wall is not the ground.** It hangs a
single painting to be looked at closely, and the job there is to read the colour
true, which a warm ground works against — a brown-black pushes the eye's white
balance and cools every ochre on it. So it is a neutral near-black, never `#000`.
**The accent does not appear on it**: terracotta there is 2.73:1, short even of
the 3:1 a focus ring needs, so the view redraws its focus ring in
`--text-on-viewer`, and `check:contrast` asserts the accent stays out.

### The three rules that get broken

1. **Only `--accent` may carry terracotta text.** Never introduce a softer one
   for type, however much better it looks alone — the hue runs out of contrast
   almost immediately, and a soft terracotta on the wall fails AA.
2. **On `--surface-tint`, text is `--text-primary` or `--status-sold-text`.**
   Nothing else. `--text-muted` there is 4.46:1 and is forbidden.
3. **A painting is never cropped.** Fixed container, painting fitted inside at
   its own ratio, centred. `object-fit: cover` on a work is a bug. See images.md.
   The artist's portrait is the one still image that fills and crops, in
   `PortraitFrame` — never copy that into `ArtworkFrame`; `check:crop` fails if
   anyone does.

`npm run check:contrast` enforces 1 and 2 — every permitted pairing must clear
AA, and the forbidden ones must keep failing. Run it after touching a colour.

## Tokens

All colours, spacing, typography, and transitions live in `app/tokens.css`. It is
the only place those values are defined, so the whole site can be re-themed from
one file.

Never write a raw colour or a magic pixel value in a component stylesheet. If a
value is missing, add a token.

**The reading scale (raised 23-10-2026).** Running text is 17px on a phone
and 18px from 48rem; **nothing a visitor reads is below 14px**, which is what
`--text-xs` now is — the floor, not a size for fine print. The steps moved
together (`--text-sm` 15/16, `--text-md` 19/20, `--text-lg` up a step) because
raising body text alone left card titles smaller than the paragraphs under
them. `--text-xl` is the admin's page titles now. **The headings and the
cards have their own scale since 03-11-2026** — see "The type scale" under
Typography below. Her name on About, `--text-2xl`, stays the largest type on
the site, and the admin keeps `--text-xl`. **The header holds its
own sizes**, `--text-nav` and `--text-nav-count`, at what they were — it was
tuned word by word against the brush name and verified pixel-identical after
the change; never point a header word back at a reading step.

**Vertical rhythm has three steps (23-10-2026)**, so a page reads as a
sequence of subjects rather than one even stream: `--rhythm-tight` (48 → 64px)
for things that belong together, `--rhythm-standard` (64 → 104px) for the
ordinary gap, and `--rhythm-generous` (88 → 144px) before a change of subject.
`Section` is the only thing that spends them. **The larger steps need a tall
screen as well as a wide one** (29-10-2026): a phone on its side is 844 wide and
390 tall, and gets the phone steps.

**A short screen is its own case, at `max-height: 31.25rem`** — a phone on its
side. There the header stops sticking, the hero sets its footage beside its
line, the artwork page lets the painting take 75svh, and the full-screen view
lays its top bar over the painting. Height, never orientation alone, so a tablet
on its side keeps the ordinary layout.

**Safe areas are live** since the public layout opted in with
`viewport-fit=cover` (29-10-2026). `--page-gutter` already grows into a
landscape notch, so a Container needs nothing; anything fixed or full-bleed
that reaches a screen edge carries its own `env(safe-area-inset-*)`, as the buy
bar, the WhatsApp button, the viewer, the footer and the header do.

On the homepage the hero is one
unit, the works grid opens after a generous gap, and the promises and story
take standard. **A heading stands on its own** — the small labels above section
headings were removed on 25-10-2026 as template chrome; only About keeps one,
above the artist's name.

**Motion is one moment, and never a condition of being seen (25-10-2026).** Two
things move: painting cards hang themselves every time
they come into view, scrolling either way — the mat and the painting on it rise into place as one
piece, a beat apart along each row in reading order (`--duration-rise`,
starting from `--rise-from-opacity` so nothing is ever blank); and on a device that
hovers a card's painting lifts 3px with its shadow deepening to the bare one.
**On the wall the hovered board also takes a contour** (03-11-2026, the
artist's reference): 1.5px of a soft warm brown flush against its outer edge —
`--contour-color`, mixed from `--text-muted` and `--line-on-band` (about
`#998780`), lighter than the ink at her request and chosen on the wall against
the ink, the muted ink and the clay alone —
fading in with the lift — `--contour-width` / `--contour-color`, drawn in
`ArtworkFrame.module.css` as a spread shadow on the board's `::after`, so it
takes no room and nothing on the wall moves (measured: zero pixels on every
card, portrait, square and landscape, both languages). Not a border: Chrome
rounds a border down to whole device pixels and left a gap at a 1.25 scale.
Pointer devices only; keyboard focus shows it too, inside the accent focus
ring, which stays. Not motion, so reduced motion shows it with no fade.
Sections used to rise in and paintings to fade in as they loaded; both were
removed because, with the spacing, they made the scroll feel empty. Both moves
live behind `prefers-reduced-motion: no-preference`, and the rise is switched on by
`QuietMotion` after hydration only — **never hide content in CSS that a script
has to reveal**, because a page whose script fails would then be blank.

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
here". There is only ever one of those in view — the buy button on an artwork page,
the checkout button in the cart, and the homepage hero's way into the gallery
(`ButtonLink`'s `primary` variant). The artwork page's second control, the inert
"buy now", is **not** a second fill: it is `--surface-tint` with a
`--line-strong` hairline, which is the third step on this scale and the one to
copy for any future secondary button. A surface fill is only 1.11:1 against the
wall, so **the hairline is what makes it a button at all** and is not optional.
Note that the clay is also the sold badge's background, so that one value now
carries two meanings.

**Every filled control darkens under the pointer, and the steps are matched.**
`--accent` moves to `--accent-hover` at 1.30:1; `--surface-tint` moves to
`--surface-tint-hover` at 1.25:1, derived the same way — each channel scaled,
so hue and warmth survive and only the level moves. A button that sits beside
one that responds and does not respond itself reads as broken, which is how
this token came to exist.
See commerce.md for the measurement that chose it over a dark fill. `--text-on-accent` on `--accent` is one
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
for exactly that reason. **There is one other direction-conditional value**,
and it is a token for the same reason: `--origin-inline-start` in
`app/tokens.css` names the physical edge a line starts from, because
`transform-origin` has no logical keywords either. The header's hover hairline
grows from it, so the line draws in the direction the words are read. It is set
for `[dir='ltr']` as well as `[dir='rtl']`, so an English fragment inside a
Hebrew document does not inherit the right-hand edge.

**The stacking order is five numbers, each naming its neighbours**: the sticky
header 20, the phone's buy bar on an artwork page and the cart page's total bar 25
(the same kind of bar, never on one page together), the floating WhatsApp button
30, the dimmed strip beside the cart drawer on a phone 99, and the cart drawer and
skip link 100. The full-screen view needs none — it is in the top layer. There is
no scale; another layer says where it sits among these.

**On a phone the cart drawer is a panel over a locked page** (29-10-2026): below
40rem it stops 3rem short of the far edge, the strip of page it leaves is dimmed
(`--text-primary` at 20%) and a tap on it closes the drawer, and the page does not
scroll behind it (`html:has([data-cart-open])`). The no-overlay rule below is the
wide-screen rule, where the page beside the drawer stays usable.

**Two placements are physical rather than logical, and they are the only
ones.** The floating WhatsApp button takes the bottom left in both languages
and the hero's pause control the bottom right in both — `left` and `right`,
written out, each with its reason in its own stylesheet and the argument
recorded in i18n.md. They are a pair rather than two decisions: the button
claims a physical corner deliberately, so the control that used to mirror into
that corner had to stop. Everything else still
falls out of logical properties, as i18n.md requires.

**Every word in the header is set one way** — Assistant Light at `--text-md`,
full ink — the destinations, the language switch and the cart alike. A light
line is the foil to the brush name, and it is the artist's own shop's
navigation voice. Two sizes and two inks either side of a centred mark is what
made the bar read lopsided before.

`app/globals.css` holds the reset and base element styles. Nothing component-
specific belongs there.

**The reset clears `fieldset` and `legend`, and that is not tidiness.** A
`<fieldset>` with no border declared does not draw nothing — it draws the
browser's default `2px groove`, a bevelled box no token here can produce. It
appeared around the work form's sale-channel radios and read enough like a
designed container that the instinct was to move the legend onto it. A fieldset
that genuinely wants a box says so: `AdminWorkForm.module.css`'s `.group` does,
and its legend still sits in the border notch, because that follows from the
fieldset having a border rather than from the border being the default one.

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

**The header's brush name is not a third face.** It is a drawing of one word —
Comforter Brush outlined into an SVG, `public/brand/wordmark.svg` — and the page
loads no font for it. Keep it that way: setting any other text in a brush or
script face is a third typeface, and the rule above still applies to it.

Loaded once, through Next's font handling. Not imported ad hoc in a component.

**The faces: Heebo for display, Assistant for body (03-11-2026).** Heebo
replaced Frank Ruhl Libre, which the artist found old-fashioned; it went onto
the site before her final word, and the comparison at `/admin/dev` stays up
until she confirms it. **The display face is never preloaded** — preloading it
put its files ahead of the first painting on a phone (30-10-2026) — and **only
the weights the site sets are loaded**: 300, 400 and 600, which Google serves as one
variable file per subset — adding 300 for the hero added no file.

**Two display weights, by role, and no Hebrew step.** Every display-face rule
asks for `--weight-hero` (300), `--weight-heading` (600) or `--weight-title`
(400), never a raw weight. The hero line alone is light: at 600 it read as too
loud. Heading is the role, not the tag: page and section
headings, her name on About, a footer column, a promise, a dialog's heading.
Title is a painting's title anywhere, and any running text in the display face —
the About lead, the footer's line, a total, the full-screen caption. Frank
Ruhl's Hebrew drew a weight lighter than its Latin, so Hebrew used to step one
weight heavier; **Heebo was measured before that was carried over** (stems at
200px: 18 and 18 at 400, 25 and 25 at 600) and its two scripts match, so the
step is gone. Measure the next face the same way before assuming either.

**The type scale (03-11-2026)**, all in `app/tokens.css`:

| Token | Phone | From 48rem | Weight | Used by |
|---|---|---|---|---|
| `--text-hero` | 30px at 375 | up to 48 | hero (300) | the homepage's positioning line — **one line at 375 in both languages**, and always above `--text-section` |
| `--text-page` | 28 | 28 | heading | a page's own heading; the artwork title from 60rem |
| `--text-section` | 24 | 24 | heading | a heading inside a page; **the artwork title below 60rem** |
| `--text-title` | 18 | 20 | title | a painting's title on a card — the wall, gallery, homepage, "more works" |
| `--text-detail` | 16 | 18 | body | a card's medium, size and price |

The small desktop headings are the artist's call, so the paintings carry the
page. The card sizes are for cards only: the artwork page keeps its price and
specs at their own sizes. Her name on About, and every display-face text outside
the table, kept its size when the face changed.

**The artwork title is 24px on a phone so it stays on one line at 360px**,
because the phone stack assumes one line and a second one puts "add to cart"
under the WhatsApp disc. Measured on all 32 published titles on 03-11-2026,
against 297px of room: **Hebrew fits up to 24 characters** ("פרחים ורודים באגרטל
כחול", 274px) and every title of 25 or more wrapped; **English fits up to 27**
("Pink Flowers in a Blue Vase", 296px), but width decides, not count —
"Autumn Beyond the Window", 24 characters, is 303px and wraps. **Treat 23
characters in English and 24 in Hebrew as the length a new title can be trusted
to fit**, and check anything longer on a 360px phone.

**Six published titles still take two lines at 360px**, recorded rather than
worked around: "השביל המתפתל בדרך אל הכפר", "לשתות לחיים עם כוס יין אדום",
"Cloudbreak Over Turquoise Water", "A Sailboat in a Coastal Town" and "Autumn
Beyond the Window" — all buyable, so on a 360px phone their "add to cart" sits
under the disc until the page scrolls — and "Radiant Sunset Over Quiet Waters" /
"שקיעה זוהרת מעל מים שקטים", which is sold and has no button. Only 360 was
measured for these; a wider phone has more room.

**Hebrew running text sets tighter**: 1.55 rather than 1.65
(`--leading-normal`), because it has almost no ascenders or descenders. Keyed
on language, not direction, so the English line inside the Hebrew hero keeps
the Latin setting. **The artwork page's phone stack is 8px shorter in Hebrew**
for that reason (`--plate-stack` in `ArtworkDetail.module.css`), which keeps
"add to cart" exactly 8px above the WhatsApp disc in both languages —
re-measured with Heebo at 360, 390 and 414 on every buyable work.

**No spaced capitals anywhere on the public site (30-10-2026).** Labels,
buttons, badges and totals are sentence case and untracked in English, the way
the navigation already was: Hebrew has no capitals, so tracked caps made English
alone speak in a second voice, and read as a template. The strings in `en.json`
are written in sentence case; do not reach for `text-transform` to change that.

**Long prose takes `--measure-prose` (29rem), short text wraps pretty.** The
artwork description and the homepage story hold to about 60–65 characters a
line, counted line by line, in both languages. Short text — the promises, card
captions — sets `text-wrap: pretty` so no line ends on one word, and card titles
`balance`; a long paragraph keeps the browser's ordinary wrap.
