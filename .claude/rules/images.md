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
- `object-fit: cover` on a painting is a bug. So is a fixed `aspect-ratio` on the
  image itself, and so is any crop applied at the image-service level.
- The padding around a fitted painting is the mat, visually. Treat it as part of
  the design, not as leftover space.

`components/ui/ArtworkFrame.js` owns this. `.frame` carries the shared
`aspect-ratio`; the painting is centred inside a `.mat` that is
`position: absolute`, with `max-width`/`max-height: 100%`.

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
16/9 on a phone, 2.35/1 from 48rem up. One source file, art-directed per
screen.

That is what lets the hero be a wide cinematic band instead of a tall block —
436px instead of 576px at 64rem, which is the difference between the first row
of paintings reaching the fold on a laptop and not. Cropping wider costs no
resolution: the source is 1080px wide either way and only height is trimmed.

**The distinction is the work, not the medium.** If a painting is ever shown as
video — a pan across a canvas, a turntable — it is still a work for sale and it
is still never cropped. `object-fit: cover` belongs on footage of the artist and
nowhere else. The rule is written at both call sites for exactly this reason.

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

## Current images are stand-ins

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

**A share image is not a delivery URL.** The Open Graph image is the painting's
own stored reference, untransformed — see seo.md — so nothing on that path
resizes and nothing on it may crop either.

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
