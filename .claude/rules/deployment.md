# Deployment

## Hosting — Vercel

**One project, one deployment.** Frontend and API are the same Next app, so
unlike the owner's previous project there is no separate server deployment and
no `VITE_API_URL`-style cross-origin wiring to keep in sync.

`vercel.json` sets the framework, pins the region to `fra1` — closest to the
Israeli audience — and sends `X-Robots-Tag: noindex, nofollow, noarchive` on
`/admin/*`.

Pushing to `main` triggers a deployment.

## Build

`prebuild` regenerates the image manifest, so the deployed build always matches
the images actually in the repo.

## Database — Neon

Not connected yet. When it is: the connection string is an environment variable
in the Vercel project, and schema changes are applied to Neon deliberately as
part of deploying — never assumed to have happened.

## Environment variables

Set in the Vercel project, mirroring `.env.example`. A missing variable should
fail the build loudly rather than degrade silently at runtime.

## Before going live

Beyond a green build, these are launch blockers and are easy to forget:

- **Real photography.** Every image in the repo today is a compressed stand-in.
  See images.md.
- **Real content.** The placeholder dimensions, prices, years, media and
  descriptions are deliberately absurd so they cannot ship unnoticed. They must
  all be replaced.
- **The legal pages**, with real text: terms, shipping and cancellations,
  privacy, accessibility. See commerce.md.
- **A custom domain**, not the vercel.app URL.
- **Both languages walked end to end**, including checkout, in right-to-left.
