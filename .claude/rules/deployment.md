# Deployment

## Hosting — Netlify

**One site, one deployment.** Frontend and API are the same Next app, so unlike
the owner's previous project there is no separate server deployment and no
`VITE_API_URL`-style cross-origin wiring to keep in sync.

Pushing to `main` triggers a deployment.

### The plan: free while building, paid the day it sells

Build on the free tier. **Move to the paid tier the day the site can take
money**, and treat that as part of going live rather than as something to do
when it becomes a problem.

The reason is what the free tier does when it runs out: **it stops the site.**
It does not bill for the overage and carry on, and it cannot be topped up in
the moment — so the failure is the shop being off, at exactly the time traffic
is highest, and the fix is an upgrade that takes longer than the outage is
tolerable. A shop that goes dark on its best day is not a free shop.

While nothing is deployed and nothing is for sale, the free tier costs nothing
and risks nothing. That changes on the first real customer, not on the first
busy week.

### Still to do, and deliberately not done yet

**This project was going to deploy to Vercel and the decision changed.** The
migration itself is not done, on purpose: nothing is deployed, so no host config
can be verified by anything, and a config file that looks authoritative while
untested is worse than a written-down task. These are the tasks.

- **Replace `vercel.json`.** It is still in the repo and still describes Vercel:
  the framework, the region, and the headers below. Netlify reads none of it. It
  is left in place rather than deleted so that what it holds is not lost before
  it is carried over — but **nothing in it is in effect on Netlify**, and it
  should not be read as live configuration.
- **Carry over the `X-Robots-Tag` headers**, which is the one item here with a
  consequence rather than an inconvenience. `vercel.json` sends
  `noindex, nofollow, noarchive` on `/admin/*` and `/dev`, and that is the
  second of the two places those routes are kept out of search — `app/robots.js`
  is the first. Until the headers exist on the new host, **that belt-and-braces
  is down to one strap.** `robots.js` still covers it, so this is not an open
  door; it is the redundancy that seo.md and security.md both ask for, missing.
- **Confirm whether a region can be pinned near Israel.** `vercel.json` pinned
  `fra1` (Frankfurt) for latency to an Israeli audience. Whether the chosen
  Netlify plan offers an equivalent, and what it is called, is unverified —
  find out rather than assuming it transfers.

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

When Neon arrives: the connection string is `DATABASE_URL` in the Netlify
site, and the migrations in `database/migrations/` are applied to it **by
hand, in numeric order, as a deliberate step of deploying** — never assumed to
have happened. There is no runner and no ledger table, so the only way to know
what a given database has had applied is to ask that database.

Two hazards specific to having two databases:

- **The local database and Neon can drift.** Applying a migration locally does
  nothing to production. A deploy that ships code depending on a new column
  before that column exists in Neon fails at runtime, not at build time.
- **`npm run seed:local` must never reach production**, which is why it refuses
  any host that is not loopback and also refuses when `NODE_ENV=production` or
  when the environment variables a build host sets are present — Netlify's and
  Vercel's both, so the guard did not quietly lapse when the host changed. It
  writes deliberately absurd placeholder prices; running it against real data
  would be unrecoverable without a restore.

## Environment variables

Set in the Netlify site, mirroring `.env.example`. A missing variable should
fail the build loudly rather than degrade silently at runtime.

`NEXT_PUBLIC_SITE_URL` is the one that will stop a deploy, and is meant to:
without it the build throws while rendering the sitemap and the artwork pages.
Set it to the real domain, not the host's own preview URL — a canonical tag
pointing at a preview host is how a preview deployment ends up in search results
instead of the site.

`GEMINI_API_KEY` is the one deliberate exception. It is optional, and without it
the admin form asks for the English by hand rather than offering to write it —
a feature that is absent, not a site that is broken. Set it when the artist
should have the help; leaving it unset is a supported state, not a launch
blocker.

The three `CLOUDINARY_*` keys behave the same way and are needed **as a set**:
with any of them missing the work form shows its notice instead of the upload
panel. Two things about them are worth knowing before deploying:

- **The cloud name is not needed at build time.** A hosted painting is resized
  by the host, from a URL `lib/image-loader.js` builds out of the value stored
  in the database — so nothing about delivery is baked into the build and no
  `remotePatterns` entry exists to keep in step. All three keys are read at
  request time, by the admin only.
- **The images the artist uploads are in one account, not one per
  environment.** A preview deployment sharing the production credentials writes
  into her real media library. That is tolerable for now because uploading is
  behind the admin login and nothing is ever deleted, but it is a reason not to
  hand these keys to anything that runs untrusted branches.

## Before going live

Beyond a green build, these are launch blockers and are easy to forget:

- **Real photography.** Every image in the repo today is a compressed stand-in.
  The admin can now replace them one at a time — see images.md — so this is
  sixteen edits by the artist rather than an engineering task, but it is still
  a blocker and it still has to actually happen.
- **Real content.** The placeholder dimensions, prices, years, media and
  descriptions are deliberately absurd so they cannot ship unnoticed. They must
  all be replaced.
- **The legal pages**, with real text: terms, shipping and cancellations,
  privacy, accessibility. See commerce.md.
- **A custom domain**, not the host's own preview URL.
- **Both languages walked end to end**, including checkout, in right-to-left.
- **A production database.** The site reads Postgres now, but only a local one
  exists: Neon is not connected, `DATABASE_URL` is not set on the host, and the
  migrations have never been applied to a hosted database. Until that is done a
  deployed build cannot render a single painting.
- **The two admin accounts existing in the production database**, created with
  `npm run admin:create` against Neon once it exists. Creating them locally
  does nothing for production, and a local run cannot reach it.
- **`ADMIN_SESSION_SECRET` set in the Netlify site**, and a different value
  from the local one. Without it every admin page throws; with the local one
  copied over, a session minted on a laptop would work in production.
- **The paid hosting tier**, from the day the site can take money. See the plan
  at the top of this file: the free tier stops a site rather than billing for
  it, and cannot be topped up while it is off.
- **The host configuration actually replaced**, and the `X-Robots-Tag` headers
  with it — `vercel.json` is still the only place they exist and the new host
  does not read it. See the migration tasks at the top of this file.
- **A check that the guard survived the deploy.** It is built, but it is
  ordinary application code rather than infrastructure: browse to an admin page
  signed out on the deployed site and confirm it lands on the login form.
