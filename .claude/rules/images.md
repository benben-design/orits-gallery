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

### Two places now hold pixel dimensions, and only one is authoritative

The database also stores them: `work_images.pixel_width` and
`pixel_height`. So the same fact lives in two places, which is normally how
facts drift. The rule that resolves it:

> **While `public/paintings/` exists, the generated manifest wins.** It is
> re-read from the actual files on every build and cannot disagree with them.
> The database columns take over when the files no longer live in the repository
> — that is, when images move to hosting and the manifest script has nothing
> left to parse.

Until then the database columns are a copy that the seed script fills in from
the manifest, and nothing should read them in preference to it. Neither number
is ever typed by hand in either place.

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

Today: files in `public/paintings/`, served through Next's built-in image
optimisation. Later: Cloudinary, swapped behind the same components.

Always use Next's image component rather than a bare `<img>`, always supply real
width and height from the manifest, and mark the hero image as priority. Nothing
below the fold should be eager.

## Alt text

Alt text is content, so it is bilingual and lives with the work, not hardcoded.
Describe the painting — subject, medium — not the fact that it is an image.

In the database it is per language and **optional** — `alt_he` and `alt_en` on
`work_images`. Absent means the application derives it from the work's title in
that language, which is why it is nullable rather than defaulted: a default
would be an English or Hebrew phrase living in the database, and every
user-facing string on this project comes from the locale files. The seeded works
carry none, so the fallback is the path currently exercised.
