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

Not connected yet. Development runs against a local Postgres, and **the
application does query it** — every page reads paintings from the database
through `lib/data/works-repository.js`. See database.md.

Those two facts together are the current deployment problem: the code now needs
a database that production does not have. `lib/db.js` throws when `DATABASE_URL`
is unset, so a deploy today fails at request time on every page that reads a
painting, which is all of them. Connecting Neon is what closes that.

When Neon arrives: the connection string is `DATABASE_URL` in the Vercel
project, and the migrations in `database/migrations/` are applied to it **by
hand, in numeric order, as a deliberate step of deploying** — never assumed to
have happened. There is no runner and no ledger table, so the only way to know
what a given database has had applied is to ask that database.

Two hazards specific to having two databases:

- **The local database and Neon can drift.** Applying a migration locally does
  nothing to production. A deploy that ships code depending on a new column
  before that column exists in Neon fails at runtime, not at build time.
- **`npm run seed:local` must never reach production**, which is why it refuses
  any host that is not loopback and also refuses when `NODE_ENV=production` or
  when Vercel's environment variables are present. It writes deliberately absurd
  placeholder prices; running it against real data would be unrecoverable
  without a restore.

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
- **A production database.** The site reads Postgres now, but only a local one
  exists: Neon is not connected, `DATABASE_URL` is not set in Vercel, and the
  migrations have never been applied to a hosted database. Until that is done a
  deployed build cannot render a single painting.
- **The two admin accounts existing**, with real password hashes. The table is
  empty and there is no way to sign in.
