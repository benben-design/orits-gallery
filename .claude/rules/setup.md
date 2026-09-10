# Setup & Commands

## Commands

```bash
npm install

npm run dev        # Next dev server
npm run build      # production build; runs the image manifest first
npm run start      # serve the production build locally
npm run lint       # ESLint, then the contrast guard, then the admin guard check

npm run images:manifest   # regenerate lib/data/image-manifest.json
npm run dev:placeholders  # regenerate the /dev placeholder images
npm run check:contrast    # WCAG check over every permitted colour pairing
npm run check:guard       # every guarded admin page calls the guard
npm run check:sitemap     # the sitemap offers built pages only, and all of them
npm run check:crop        # no image transformation crops a painting

npm run seed:local        # fill a LOCAL database with the sixteen works
npm run admin:create      # create an admin account, or change its password
```

`admin:create` prompts for the password with the echo off and refuses to run
without a terminal. The password is never an argument, never an environment
variable, and there is no default password in the repository. It takes the email
as an optional argument: `npm run admin:create -- orit@example.com`.

There is one app and one dev server. No separate API process.

## The design system at `/dev`

`http://localhost:3000/dev` renders the whole design system: every colour on the
surface it is meant to be used on, the spacing and radius scales, the
interactive states, and the real artwork component across all three
orientations and all four statuses.

It needs no database and no real content, so it stays reviewable however little
of the site is built — and it is the fastest way to see whether a token change
broke something. It is a permanent developer tool, not a scratch page.

It is reachable in production builds and on deploy previews, deliberately: a
preview URL is where a design change is easiest to review on a real device. It
is kept out of search results three ways — `noindex` metadata on its own root
layout, a disallow in `app/robots.js`, and an `X-Robots-Tag` header — and it is
unreachable from any navigation because it sits outside `app/(site)/[locale]`
entirely.

The third of those is currently missing: the header is in `vercel.json` and the
project deploys to Netlify, which does not read it. The first two still hold.
See deployment.md.

To make it developer-only instead, add an `export const dynamic` guard or a
`notFound()` on `process.env.NODE_ENV === 'production'` in its page. That also
removes it from previews, which is the trade.

## Linting

`npm run lint` does five things in order: `eslint .` over every JS/MJS file in
the project — including `proxy.js`, the config files and `scripts/` — then
`scripts/check-contrast.mjs`, the palette guard, then
`scripts/check-admin-guard.mjs`, which fails if any page in the guarded admin
group does not call `requireAdminSession`, then `scripts/check-sitemap.mjs`,
which fails if the sitemap offers a stub or omits a finished page, then
`scripts/check-image-crop.mjs`, which fails if the image loader would ask the
host to crop a painting.

All four guards are advisory in the same way lint is: they are **not** in the
build and cannot fail a deploy. That is deliberate for the palette. For the
other three it is a real limitation worth knowing — a page added without the
guard ships, a stub listed in the sitemap ships, and a cropping transformation
ships, and the checks only complain when someone runs them.

The crop guard is the one whose absence would be hardest to notice. The other
three protect against something a person could eventually see; a cropped
painting delivered into a correctly-built frame looks entirely right.

## The sitemap guard

`npm run check:sitemap` holds `lib/public-routes.js` against what is actually on
disk. It exists because the sitemap originally listed the whole locked route
map, six entries of which were stubs — a first deployment would have handed
Google six placeholder pages, and thin content indexed early is expensive to
undo.

The invariant is that **every `page.js` under `app/(site)/[locale]/` is exactly
one of three things: a stub, a deliberate exclusion, or listed in the sitemap.**
"Stub" is not a judgement call — it is whether the page renders
`components/ui/StubPage`, so a page stops being one by the same act that builds
it. That closes both directions: a stub in `INDEXABLE_PATHS` fails, and a
finished page in none of the three lists fails too, so neither "remember to
remove it" nor "remember to add it" is left to anybody's memory.

Exit codes: `0` all as declared, `1` a page is misfiled or a declared path has
no page behind it, `2` the public route tree has moved and the script must move
with it.

## The palette guard

`npm run check:contrast` computes WCAG 2.1 contrast for every foreground /
background pairing the design rules permit, and fails if one drops below AA for
normal text. It also asserts the **forbidden** pairings — chiefly `--text-muted`
on `--surface-tint`, which misses AA by four hundredths. If someone later
"fixes" that by nudging a colour, the guard fails and says which rule was
erased. It prints a table either way; the values come from `app/tokens.css`, so
it cannot drift from what it guards.

Run it after touching a colour. Exit codes: `0` all as specified, `1` a pairing
is wrong, `2` a token it needs is missing from `app/tokens.css` — which means a
rename needs mirroring into the guard.

Config is `eslint.config.mjs` at the repo root, in ESLint's **flat config**
format, which is the only format Next 16 supports. It extends
`eslint-config-next/core-web-vitals` — the `core-web-vitals` set rather than the
base one, because the rules worth having are the Next-specific ones it adds.
Dependencies are `eslint` and `eslint-config-next`, dev only, and nothing else:
no Prettier, no plugin bundles, no opinionated presets.

Ignored: `.next`, `out`, `build`, `node_modules`, `public`, and
`lib/data/image-manifest.json`, which is generated by a script rather than
hand-maintained. Note that passing `globalIgnores` **replaces**
`eslint-config-next`'s own default ignores instead of adding to them, so the
defaults are restated in the config alongside ours — dropping them silently
starts linting `.next`.

**Linting is deliberately not part of the build.** It is not in `build` and not
in `prebuild`, and there is no pre-commit hook. Run it when you want it. A lint
error must never be able to fail a deployment: this site has to be able to ship
while there is still an unused variable somewhere. Do not "helpfully" wire it
into the build later.

Do not re-add a `lint` script that calls `next lint`. That command was removed in
Next 16 and now reads `lint` as a directory name and fails.

**Stop `npm run start` before running `npm run build`.** A rebuild replaces
`.next` underneath a running server, which then serves a half-swapped build —
broken stylesheets and 500s on chunks, with no error that points at the cause.

## After changing images

Adding, removing or replacing anything in `public/paintings/` requires
`npm run images:manifest`. `prebuild` runs it too, so a production build can
never ship a stale manifest — but the dev server will happily use an old one.

## Environment

`.env.example` at the repo root lists every key the project will need, with
dummy values. Copy it to `.env.local` and fill that in; `.env.local` is
git-ignored by the `.env*.local` rule and never committed.

**Seven keys are read today, and four of them are optional.** `DATABASE_URL`, by
`lib/db.js` and so by every page that reads a painting, and separately by the
seed script. And `ADMIN_SESSION_SECRET`, by `lib/auth/session.js`, which signs
the admin session cookie — it must be at least 32 characters, and signing refuses outright below
that. Generate one with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Without either in `.env.local` the dev server starts and then fails on the first
page that needs it, with a message naming the fix.

The third is `GEMINI_API_KEY`, read by `lib/translate.js`, which fills the admin
form's English fields in from the Hebrew. It is **optional, and behaves that
way**: with no key the admin asks for both languages by hand exactly as it did
before — no button, and no failure message under every field she fills in. One
key and one host; the model is pinned in `lib/translate.js` rather than
configured here. Nothing on the public site reads it. **Rotating
`ADMIN_SESSION_SECRET` signs everyone out immediately** — that is the only way
to revoke a session, and it is deliberate; see security.md.

The fourth is `NEXT_PUBLIC_SITE_URL`, read by `lib/site-url.js` — the absolute
base for canonical URLs, hreflang pairs, the sitemap and share images, none of
which can be built from a relative path. **Unset, a production build fails**,
which is deliberate: a wrong base does not break a page, it publishes a canonical
URL pointing somewhere else and nobody notices for weeks. On a laptop it falls
back to the dev server's own address, so `npm run dev` works without it and
`npm run build` does not.

The fifth, sixth and seventh are `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`
and `CLOUDINARY_API_SECRET`, read by `lib/image-host.js` — where the artist's
own photographs are uploaded to and served from. They are needed **as a set**,
and optional in the same way the translation key is: with any of them missing
the work form shows a notice where the upload panel would be, rather than
offering a control that fails. All three are read at request time and by the admin only: **delivery needs none
of them.** A hosted painting is resized by the host, from a URL
`lib/image-loader.js` builds out of the reference stored in the database, so a
work already uploaded goes on rendering for visitors whatever these keys say.

**The three `HYP_*` keys are read now**, by `lib/payments/hyp.js`, and they
behave like the Cloudinary set: needed **as a set**, server-side only, and
**optional in the same way** — with any of them missing the checkout page shows
a notice where the payment form would be, rather than offering a control that
dies on submit. `HYP_TERMINAL_NUMBER`, `HYP_API_KEY` and `HYP_API_PASSWORD`
belong to **one terminal**.

There is a fourth, `HYP_ENDPOINT_OVERRIDE`, and it is **development only and
normally absent**. It points the two Hyp calls at a stand-in so the payment
return could be exercised before the account existed — this provider has one host
for test and production, so there is no sandbox to aim at. It is **ignored when
`NODE_ENV` is production**, which covers the live site and Netlify deploy
previews both, and that guard is the whole of what makes it safe. Delete it once
there is a test terminal. See deployment.md.

There is one more guard worth knowing about: **outside production, a terminal
number that is not a test terminal is refused outright**, with nothing signed. Hyp's
test terminals start with `00100`, and the failure that rail prevents — a real
card charged during a test — is not one you can recover from by noticing it
afterwards.

Development runs against Hyp's documented **test** terminal; the production
terminal is provisioned separately, so the two environments differ by these
three values and by nothing in the code. Two further settings are not variables
at all — the payment-page signature and the return URLs live in the Hyp console,
at the terminal level, and the signature must not be switched on until the
verification code is built and tested. See api.md.

Add a key to the example in the same change that starts reading it, and keep a
real terminal's credentials in `.env.local` and the Netlify site and nowhere
else.

As each arrives, add it to `.env.local` locally and to the Netlify site for
deployment. Never commit real credentials.

## Database

A **local Postgres**, created by hand in pgAdmin, called `art_studio`. Neon is
the intended production host and is not connected yet.

The schema is plain SQL in `database/migrations/`, applied by hand in numeric
order — no runner, no ORM, forward-only. Conventions and the whole schema are in
database.md.

Two operational notes that cost real time when missed:

- **`psql` on Windows defaults its client encoding to WIN1252.** A single
  character in a migration with no WIN1252 equivalent aborts the statement it
  sits in, and the errors that follow point somewhere else entirely. Migrations
  are written ASCII-only for this reason; `$env:PGCLIENTENCODING = "UTF8"`
  fixes the shell if you ever need it. pgAdmin's query tool is unaffected.
- **Reconnect the pgAdmin query tool to the right database before running a
  migration.** It keeps the previous connection, and the tables land in
  `postgres` with no error.

**Do not run `npm run seed:local` against a database that holds the real
catalogue.** It upserts on `slug_en` across every column, so it replaces the
real titles, prices, sizes, media and descriptions with the deliberately absurd
stand-ins and reverts the images to the local files. It was safe to re-run when
the fixture *was* the data; it is not any more. Migration 008 is the way back
if it happens.

For a genuinely empty local database, the sixteen works now come from
`database/migrations/008_load_catalogue_data.sql`, applied in numeric order with
the others. `seed:local` remains for a database with no catalogue in it at all.

**The local database is now a requirement for running the site at all**, not
just for the seed script. Every page reads paintings from it, so on a fresh
clone the order is: create `art_studio`, apply the migrations in numeric order,
copy `.env.example` to `.env.local` and set `DATABASE_URL`. The
migrations now include the catalogue: 008 loads the sixteen works, so
`seed:local` is not part of a fresh clone any more. Skip any of those and the dev server starts and then
errors on the first page that reads a painting.
