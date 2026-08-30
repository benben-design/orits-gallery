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

**`ArtworkFrame`'s `bare` tone is currently unused, and that is not an
oversight.** It exists for a single large work hanging straight on the wall —
enough presence to hold the ground by itself, where a mount would read as a
card, and a card reads as commerce rather than gallery. The homepage hero was
that work until the hero became studio footage, so nothing passes `tone="bare"`
today.

Keep the tone and keep `--shadow-frame-bare`. The artwork page's main image is
the obvious next place for it, and the pairing is load-bearing when it is used:
with no mount the shadow is the *only* thing separating the work from the
beige, so `bare` carries a heavier shadow at the same ink and the same
neutrality. Still a canvas on a wall, never a floating card. If `bare` is ever
used again without that token, the work meets the wall with nothing in between.

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

## Delivery

Today: files in `public/paintings/`, served through Next's built-in image
optimisation. Later: Cloudinary, swapped behind the same components.

Always use Next's image component rather than a bare `<img>`, always supply real
width and height from the manifest, and mark the hero image as priority. Nothing
below the fold should be eager.

## Alt text

Alt text is content, so it is bilingual and lives with the work, not hardcoded.
Describe the painting — subject, medium — not the fact that it is an image.
