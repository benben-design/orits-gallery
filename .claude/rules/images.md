# Images

The paintings are the product. Everything here is a functional requirement.

## Never crop a painting

This is the single hardest rule in the repo.

The works come in wildly mixed aspect ratios — currently nine portrait between
0.62 and 0.79, five near-square between 0.95 and 1.03, and two landscape at 1.47
and 1.51. That mix is normal for a painter and will get wider, not narrower.

Therefore:
- Every grid card is a **fixed-size container**, and the painting is **fitted**
  inside it at its own aspect ratio, centred, with padding around it.
- Rows stay aligned because the containers are equal — not because the images
  were forced to match.
- `object-fit: cover` on a painting is a bug. So is a *shared* `aspect-ratio`
  on the image itself — one shape forced on every work — and so is any crop
  applied at the image-service level. The painting's **own** ratio, from its
  file's pixel dimensions, is the opposite of a crop: it is how its box is
  reserved before the file arrives (below).
- The padding around a fitted painting is the mat, visually. Treat it as part of
  the design, not as leftover space.

`components/ui/ArtworkFrame.js` owns this. `.frame` carries the shared
`aspect-ratio`; the painting is centred inside a `.mat` that is
`position: absolute` and a **size container**, in a `.hang` box at the
painting's own ratio (`--painting-ratio`, width over height of the file) and
as large as fits in both axes: `min(100cqi, 100cqb × ratio)` wide.

**The box is reserved before the file arrives, and that is why it is computed
rather than left to the image** (29-10-2026). It used to be `max-width` /
`max-height: 100%` with `width`/`height: auto` on the image, which gives the
same fit once the file is there and **nothing before** — the image was 0×0
until its intrinsic size was known, then appeared: a layout shift of 0.19 on
the artwork page and 0.06 in the gallery. Now the box, its shadow and a quiet
`--surface-sunk` fill are there from the first paint, and the file fades in
over them. Do not go back to `width: auto` on the image. The hover lift and the
shadow live on `.hang`, the card's load fade on the image.

**The mat must stay out of normal flow.** In normal flow the image's intrinsic
height beats the frame's `aspect-ratio` and stretches the box, so cards come out
at different heights and the grid goes ragged — measured at 340px to 402px tall
across one twelve-card grid before it was fixed. This is the bug this rule exists
to prevent, and it does not look obviously wrong until you measure it.

## The mount, and the one work that goes without

The rule is **not** "every painting has a mount". It is:

> A painting must never meet the warm wall at small scale without separation.

The mount solves a problem of repetition and scale. Many small works in a grid
are warm on warm, and each one needs its own edge; the near-white mount board
(`--surface-mat` against `--surface-wall`) gives it to them. That separation is
deliberately slight — 1.179:1, about 6.4 L\* — so the mount alone is not what
holds the edge. `--shadow-frame` on the painting does the rest.

**`ArtworkFrame`'s `bare` tone belongs to the artwork page, and to nothing
else.** It exists for a single large work hanging straight on the wall — enough
presence to hold the ground by itself, where a mount would read as a card, and a
card reads as commerce rather than gallery. The homepage hero was that work until
the hero became studio footage; `components/ui/ArtworkDetail.js` is the caller
now, and it is the only one — which means both the public artwork page and the
admin preview that renders the same component get it, as they should.

The pairing with `--shadow-frame-bare` is load-bearing wherever it is used: with
no mount the shadow is the *only* thing separating the work from the beige, so
`bare` carries a heavier shadow at the same ink and the same neutrality. Still a
canvas on a wall, never a floating card. If `bare` is ever used without that
token, the work meets the wall with nothing in between.

The same page keeps the **mounted** tone for the supporting images beneath it,
and that is the rule stated twice rather than an inconsistency: one large work
holds its own edge, several small ones warm-on-warm do not.

**The hero itself is no longer governed by this section.** It is footage, not a
painting — see the cropping note below.

## Footage may be cropped. Paintings may not.

The never-crop rule protects **works for sale**. It is not a general statement
about rectangles.

Studio footage — the artist painting, her hands, the palette — is documentary
material, not a work anyone is buying. Nobody is judging its composition and
nothing is lost by reframing it. So the homepage hero uses
`object-fit: cover` inside a frame whose ratio changes between breakpoints:
4/3 on a phone, the source's own ratio, and 2.5/1 from 48rem up. One source file, art-directed per
screen.

That is what lets the hero be a wide cinematic band instead of a tall block —
436px instead of 576px at 64rem, which is the difference between the first row
of paintings reaching the fold on a laptop and not. Cropping wider costs no
resolution: the source is 1080px wide either way and only height is trimmed.

**The distinction is the work, not the medium.** If a painting is ever shown as
video — a pan across a canvas, a turntable — it is still a work for sale and it
is still never cropped. `object-fit: cover` belongs on footage of the artist and
nowhere else. The rule is written at both call sites for exactly this reason.

## The artist's portrait fills its slot (decided 27-09-2026)

**The one still image that may be cropped, and it is her, not a work.** Her
photograph on the homepage story section and the About page fills its slot edge
to edge, with no mat, cropped to fit and **anchored to the top** so a
head-and-shoulders shot never loses the face. The slot is 4:5 at every width —
`--portrait-ratio`, a token of its own so that reshaping the paintings' frame
cannot reshape it.

It was hung in `ArtworkFrame` first, which is the correct treatment for a
painting and the wrong one for a photograph: it sat small on a white mat inside
a larger box and read as a painting *of* her. Do not "fix" it back into a mat.

Three things keep the exception from spreading:

- **It has its own component, `components/ui/PortraitFrame`**, rather than a
  tone on `ArtworkFrame`. A cropping mode inside the painting frame would be one
  prop away from cropping a painting.
- **The cropping is CSS, never the image host.** The file is delivered whole
  through `lib/image-loader.js` like everything else, so the delivery rule —
  `c_limit`, width only — covers it unchanged.
- **`npm run check:crop` now also asserts that `ArtworkFrame`'s stylesheet
  never contains `object-fit: cover`**, so the portrait's declaration cannot be
  copied into the frame every painting uses without the check failing.

The admin's thumbnail of the portrait, on `/admin/settings`, stays in
`ArtworkFrame`: it is a preview of the file she uploaded, whole, not the page.

## No badge is ever overlaid on a painting

Status lives in the caption, beside the price, in all four states. It is
commercial metadata about the work, not part of the picture.

This was tried the other way and rejected on purpose. A badge at the mount's
top inline-start corner lands **on** the painting for every portrait work —
they are height-limited inside the 4/5 frame, so they touch the mat's top edge,
and nine of the sixteen works are portrait. Avoiding that means either
reserving space at the top of the mat, which breaks the even margins the mount
exists to provide, or squeezing the badge into a padding band that is only 16px
wide at the mobile clamp floor. Neither is worth it: a label floating over a
painting is a shop convention that cheapens the work, and it splits status
across two zones for no gain.

## Real dimensions are read, never typed

`scripts/generate-image-manifest.mjs` parses the JPEG/PNG headers of everything
in `public/paintings/` and writes real width and height into
`lib/data/image-manifest.json`. It runs on `prebuild`, so the manifest cannot
drift from what is on disk.

Never hardcode a painting's pixel dimensions. If you add or replace an image,
run `npm run images:manifest`.

The layout needs those numbers precisely because it must not crop: to reserve
the right box before the image loads, and to avoid layout shift.

### Two places hold pixel dimensions, and the reference decides which one wins

The database also stores them: `work_images.pixel_width` and
`pixel_height`. So the same fact lives in two places, which is normally how
facts drift. What resolves it is not a rule about the site as a whole — it is
a question asked **per image**, and the stored `image_ref` answers it:

> **A reference that points inside the repository resolves from the generated
> manifest. Any other reference resolves from the database columns.** The two
> kinds are told apart by the shape of the value: a local path begins with a
> slash, a hosted identifier does not.

For a local file the manifest wins because it is re-read from the actual files
on every build and cannot disagree with them, while the columns are a copy the
seed script wrote once. For a hosted one the columns are not a fallback but the
only source there is — the manifest script parses `public/paintings/` and
nothing else, so a file that is not in the repository has no entry in it and
never will.

**This was a global rule until now, and that was a trap.** Reading the manifest
for every image meant the first work whose image lived anywhere else would
throw on every read of that work — taking the works list, the gallery and the
homepage down together, over one painting. `readPixelDimensions` in
`lib/data/works-repository.js` is where the per-image decision is made, and
`fetchImagesByWorkId` selects the two columns for it.

A local reference with no manifest entry still throws, and should: it means the
file is not on disk, so the image would 404 whatever numbers came back.

The consequence for the move to hosting is that it needs no flag day. Works
migrate one at a time, and each is read from whichever source its own reference
names. Neither number is ever typed by hand in either place.

Note also that pixel dimensions and physical size are **different quantities in
different tables**: pixels of a file in `work_images`, centimetres of a canvas
in `works.width_cm` / `height_cm`. The naming keeps them apart deliberately —
confusing them produces a layout that is wrong in a way nobody spots by eye.

## Current images — fifteen are hers now, one is still a stand-in

**Superseded for fifteen of the sixteen.** Her own originals were pulled from
under1000 and uploaded to the image host, carrying between 4x and 25x the data
of the stand-ins at equal or larger pixel dimensions. `two-pears` kept its local
file, because her copy of that one is 842x826 against our 1582x1600 — lower
compression does not buy back resolution that is not there. `tuscan-house` kept
the hosted file already attached, for the same reason.

That closes most of the launch blocker below, but **not all of it**: these are
still photographs taken for a marketplace listing rather than studio
photography, and several are shot with the frame in view.

The paragraph below describes the files still in `public/paintings/`, which
remain the manifest source and the fallback.

Every file in `public/paintings/` is a WhatsApp-compressed copy capped at 1600px,
and two of them are far smaller than that. They are fine for development and
design.

**Replacing them with proper photography is a launch blocker.** Placeholder
images are allowed in development; they are not allowed in public.

The route for that replacement now exists: the artist attaches a photograph per
work from the admin, and it supersedes the stand-in without anything being
deleted from the repository. So this stops being one migration and becomes
sixteen ordinary edits — which is also why the stand-ins can stay in
`public/paintings/` while she works through them.

Do not design around their softness. Build the layout for large, sharp images —
`next.config.mjs` already declares device and image sizes for the replacements
rather than for what is in the repo today. A design that hides low resolution
behind small thumbnails will waste the good photographs when they arrive.

## Every painting gets more than one image

The model carries an ordered image collection with three types:

- `main` — the flat frontal shot. The one in the grid and at the top of the page.
- `detail` — a close-up of the brushwork at an angle. This is what proves the
  work is a physical object rather than a print, and it sells.
- `in-situ` — the painting hanging on a wall, for scale. A buyer cannot translate
  "50×70 cm" into a mental picture; this is a real conversion driver.

Only `main` exists today. Build the artwork page so the others slot in without
a redesign.

The database enforces the part that matters: **at most one `main` image per
work**, because it is the grid card, the top of the artwork page and the Open
Graph image, so "which image is the painting" must not have two answers.
`detail` and `in-situ` may repeat freely. Ordering is an explicit position, and
positions are *not* unique — two images may share one, and reads break the tie
on position then id.

## An image is not located from the work's id

This changed, and it invalidates the old shortcut.

In `lib/data/artworks.js` one string is the work's id, its English slug **and**
its image filename stem in `public/paintings/`, so a path could be built from an
id. In the database it is not: the key is a generated uuid with no meaning
outside the database, and the image's location is its own column — `image_ref`
on `work_images`.

So **nothing may derive an image path from a work's id.** Read the reference.

`image_ref` is named neither `path` nor `url` nor `public_id` on purpose: it
holds a local path under `public/paintings/` today and a hosted identifier
later, and a name describing either one makes the other read as a bug. Swapping
delivery is a change of value, not a migration.

That today's filename stems still match `slug_en` is a leftover coincidence of
how the files were named. It is not a rule, and building on it re-creates the
coupling this removed.

## Delivery

**Both kinds now exist at once, and that is the settled state rather than a
migration in progress.** The sixteen seeded paintings are files in
`public/paintings/`. Anything the artist attaches herself lives on Cloudinary.
Both are served through Next's built-in image optimisation, both are rendered by
the same components, and which is which is a property of the stored
`image_ref` — see the per-image rule above.

**Who resizes an image is decided per image**, in `lib/image-loader.js`, wired
in as `images.loaderFile`. Every `next/image` on the site goes through that one
function and no component knows any of this:

- a **hosted** painting is resized by the host, by writing a transformation into
  its own URL;
- a **local** file keeps Next's built-in optimiser, because there is no host to
  ask.

Sending a hosted painting through our own optimiser instead would mean pulling a
file off one CDN so a serverless function could re-encode it onto another: the
same work done twice, and on a deployed site metered twice as well.

Two things about that wiring are load-bearing and were verified against Next's
own source rather than assumed:

- **It is a loader file, not a `loader` prop.** The prop would have been a
  two-line change in `ArtworkFrame`, but a function prop cannot cross from a
  server component into `next/image`, so the component passing one must be
  `'use client'` — and `ArtworkFrame` renders the gallery grid, which must not
  become a client component.
- **`images.loader` stays at its default.** Setting it to `'custom'` makes
  `/_next/image` return 404, which would break all sixteen local paintings.
  Next's config validation accepts `loaderFile` beside the default loader
  precisely so both paths can be live at once.

There is deliberately **no `remotePatterns` entry**, and the absence does work.
That list is only consulted by the built-in optimiser, which a hosted painting
never reaches — so an entry would permit nothing that happens. What it would do
is silently absorb the mistake: a hosted image that somehow fell through to the
built-in optimiser would start being downloaded and re-encoded at our expense,
and nothing in the page would look wrong. With no pattern configured, that same
mistake throws by name the first time it renders.

Always use Next's image component rather than a bare `<img>`, always supply real
width and height, and mark the hero image as priority. Nothing below the fold
should be eager.

### No transformation may crop

The delivery layer is now the second place the never-crop rule lives, and it is
the dangerous one.

Everywhere else the rule is **visible**: a fixed frame, a fitted mat,
`object-fit: contain`. You can see it break. A transformation cannot be seen. If
`c_limit` in `lib/image-loader.js` became `c_fill`, the host would return
cropped files into a layout that goes on looking perfectly correct — every box
the right size, every row aligned, every painting quietly missing its edges. No
layout code would have been touched and no rendering test would fail.

So: **`c_limit`, width only.** It scales down to fit the width and stops — it
never enlarges, and it never discards a pixel. Height is never bound, because
giving it one turns the transformation into a box the painting is fitted to
rather than a width. `c_fill`, `c_crop`, `c_thumb`, `c_lfill` and `c_fill_pad`
discard pixels; `c_pad` keeps them but adds a border, which is the mat's job.

`npm run check:crop` (`scripts/check-image-crop.mjs`) asserts this over every
width in the srcset, and also that a local file still goes to the built-in
optimiser untransformed. It is the fourth guard, the same shape as the other
three, and it exists because this is the one rule on the project that can break
without anything looking wrong.

**The share image is the second transformation, and the same rule.** Since
29-09-2026 the Open Graph image is delivered through the host as
`q_auto,c_limit,w_1200` on an address ending in **`.jpg` whatever was
uploaded** (since 30-09-2026) — built by `shareImageFor` in
`lib/image-loader.js`, beside the loader, and asserted by `check:crop` like
every srcset width: `c_limit`, width only, no crop mode, no format parameter,
a `.jpg` address, and a declared size equal to what is served. See seo.md for
why it is a JPEG.

### Every transformation this site asks the host for

**For the strict-transformations setting** — Cloudinary's option to refuse any
transformation not explicitly allowed — this is the complete list, and nothing
else in the code builds a delivery URL. Both are built in `lib/image-loader.js`,
and `npm run check:crop` prints them.

| Where | Transformation | Widths |
|---|---|---|
| Every `next/image` of a hosted painting or portrait (the loader) | `f_auto,q_auto:good,c_limit,w_<width>` | 160, 240, 320, 420, 540, 680, 640, 828, 1080, 1280, 1600, 1920, 2560 — `imageSizes` and `deviceSizes` in `next.config.mjs` |
| The artwork page's `og:image` and `twitter:image` (`shareImageFor`) | `q_auto,c_limit,w_1200`, on an address ending `.jpg` | 1200 only |

The `q_` value in the first row follows `next/image`'s `quality` prop when a
component passes one; none does today, so it is always `q_auto:good`. **Adding a
width to either config list, a `quality` prop, or a third transformation adds a
new entry here** — and, once strict transformations is on, one the host will
refuse until it is allowed. A painting that stops loading after such a change is
that, not a crop.

**The host counts an address's extension as part of the transformation.** The
loader's row is one entry per width whatever the source format, because the
host allows every format of an `f_auto` transformation. The share row is one
entry because `shareImageFor` rewrites every hosted address to end in `.jpg` —
it used to ask for `f_jpg` on the original's own `.png`, `.webp` or
`.heic` address, which would have been one entry per source format, and the
first upload in a new format would have lost its share preview silently. Do not
put a format parameter back into it.

**Changing a width list means allowing the new widths in Cloudinary before the
deploy that emits them.** Once strict transformations is on, a width the host
refuses is a 404 for every browser whose srcset picks it — **a blank painting,
with no fallback**, and nothing in the build or in `check:crop` can see it. So,
in this order: switch strict transformations off, request each new width once
against any hosted painting so the host records it, allow each one
(**Image → Manage Transformations → Log**, ⋮ → *Allowed for strict
transformations*), switch strict back on, then deploy. Update the table above
in the same change. A width removed from the list needs nothing.

## The full-screen view asks for no more than the original

The artwork page opens a painting full screen (`components/ui/ArtworkViewer.js`),
and it needs a larger file than the page — which is where the trap is. `next/image`
builds every srcset up to 2560 whatever the file is, so a 1582px original would be
requested at `w_2560`.

**Neither resizer would invent pixels** — `c_limit` never enlarges, and Next's
optimiser resizes `withoutEnlargement` — but the viewer caps the request anyway:
`fullViewLoader` in `lib/image-loader.js` limits every width to the **smallest
delivery width at or above the original's**. The original's own width cannot be
named, because only the listed widths are allowed under strict transformations;
the next one up returns the original at its own size. Capping below it instead
would have thrown away up to a fifth of the photograph. So the viewer adds **no
new transformation** to the table above: same transformation, same widths.

**And it never draws a painting larger than its file.** The box is sized from the
original's pixels, so a small original sits small with ground around it rather
than stretched soft across the screen. The box takes the work's own ratio and both
images fill it with `object-fit: contain`; `check:crop` fails if its stylesheet
ever says `cover`.

Verified on 24-10-2026 against an 842px portrait, a 1920px hosted landscape and the
1582px local square, at 375 and 1440: every fetched file at or under its original
(the 842px work asked for `w_1080` and received 842).

## How a photograph gets here

The artist attaches one on **either** admin page — creating a work or editing
it — and the panel is the same panel, with the same limits and the same
drag-and-drop.

One thing genuinely differs, and the wording differs with it. On the edit page
the photograph is **saved on its own** the moment the upload finishes: there is
a work to attach it to, and its id is bound into the action server-side. On the
create page there is no work yet, so the reference waits in a hidden field and
is written **with the record**, in one transaction — the work and its
photograph land together or neither does. The panel says which of the two is
happening rather than showing one sentence and doing the other.

**The file never passes through our server.** A Server Action caps its request
body at 1MB and these photographs are several times that, so the browser posts
the file straight to the host. The server owns the two ends of that:

- **It signs the upload beforehand.** Not an unsigned upload preset — that is a
  public write endpoint into the artist's media library, named in the page
  source and usable by anyone who reads it. The signature covers every
  parameter, so the only two the browser may send are the folder and timestamp
  we signed.
- **It reads the asset back afterwards, and stores what the host says.** What
  the browser reports about a file it just uploaded is a claim. This matters
  here more than it looks: pixel dimensions are what reserves the box before a
  painting loads, so a wrong pair is a page that jumps or a work drawn at the
  wrong ratio — in a layout whose whole rule is that a painting is never
  distorted or cropped.

She can either choose a file or **drag one onto the panel**. Dragging is an
addition and never the only route: it cannot be done from a keyboard and does
not exist on the phone she is most likely to be holding, so the file input
stays and the line advertising the drag is hidden wherever dragging is
impossible. Both arrive at the same checks — `accept` on an input has no say
over what gets dropped.

**Only JPG, PNG, WebP and HEIC are taken**, and the same list is enforced by the
signature, by the read-back, and by the panel before sending — see security.md.
**HEIC displays everywhere**, because neither delivery URL hands over the
original: the loader asks the host for `f_auto`, and a `.heic` reference comes
back as AVIF or WebP to a browser (verified 29-09-2026); the share image asks
for the same file under a `.jpg` name, which the host delivers as a JPEG every
crawler reads. On a phone this rarely arises, since the
browser's picker usually hands over a JPEG, and desktop Chrome cannot decode HEIC
to measure it, so the panel refuses one there as unreadable before it is sent.

**A file over 10MB or over 25 megapixels is refused in the browser, before it is
sent.** Those are the host's own free-plan limits, not our policy. Letting the
host refuse means she waits out an upload and is then told nothing she can act
on, in English, by another company's API. The message names the limit and the
file's actual size.

**Uploading again replaces the row, and leaves the previous file on the host.**
The database permits one main image per work, so the old row goes; the old asset
stays. Deleting remotely from a save path is a half-succeeded save waiting to
happen — the row gone and the file with it, or the file gone and the row still
pointing at it — and it turns the undo for a mistaken upload into a support
call. At thirty paintings the abandoned originals are not a storage problem
worth buying that risk to solve.

Only the **main** image can be attached this way. `detail` and `in-situ` slot
into the same table and the same page without a redesign, and are not built.

**The artist's portrait goes through the same panel**, on `/admin/settings`,
and is held to the same upload rules: signed, and read back from the host rather
than believed. It is **not** held to the never-crop rule on the page — it fills
its slot in `PortraitFrame`, anchored to the top; see "The artist's portrait
fills its slot" above. It uploads into
its **own folder**, `orit-site`, not the paintings' — the planned automation
turns a file in `orit-works` into a draft work, and a portrait there would
become one. Its alt text is her name.

**And a work cannot be published without one.** Now that attaching a photograph
is possible, publishing without one is a mistake rather than a state the admin
forces on her, so it is refused — see commerce.md for why the refusal is on the
act of publishing and never on saving a work that is already public.

## Alt text

Alt text is content, so it is bilingual and lives with the work, not hardcoded.
Describe the painting — subject, medium — not the fact that it is an image.

In the database it is per language and **optional** — `alt_he` and `alt_en` on
`work_images`. Absent means the application derives it from the work's title in
that language, which is why it is nullable rather than defaulted: a default
would be an English or Hebrew phrase living in the database, and every
user-facing string on this project comes from the locale files. The seeded works
carry none, so the fallback is the path currently exercised.

**An upload does not write them either**, and that is the same decision rather
than an omission: the admin has no alt-text field yet, and inventing one from
the filename would put a phrase in the database that nobody wrote. Adding the
field is what closes this, not the upload.
