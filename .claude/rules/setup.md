# Setup & Commands

## Commands

```bash
npm install

npm run dev        # Next dev server
npm run build      # production build; runs the image manifest first
npm run start      # serve the production build locally
npm run lint       # ESLint, then the six project guards below

npm run images:manifest   # regenerate lib/data/image-manifest.json
npm run dev:placeholders  # regenerate the /admin/dev placeholder images
npm run check:contrast    # WCAG check over every permitted colour pairing
npm run check:guard       # every guarded admin page calls the guard
npm run check:sitemap     # the sitemap offers built pages only, and all of them
npm run check:crop        # no image transformation crops a painting
npm run check:headings    # every public page renders a top-level heading
npm run check:strings     # the locale files match, and every string is read

npm run seed:local        # fill a LOCAL database with the sixteen works
npm run admin:create      # create an admin account, or change its password
```

**Both database scripts run under `node --conditions=react-server`**, and
that flag is load-bearing: `lib/db.js` is marked `server-only`, and plain Node
loads the marker's throwing half without it. Any ad-hoc Node script that
imports `lib/db.js`, `lib/auth/session.js`, `lib/translate.js`,
`lib/image-host.js` or `lib/payments/hyp.js` needs the same flag.

`admin:create` prompts for the password with the echo off and refuses to run
without a terminal. The password is never an argument, never an environment
variable, and there is no default password in the repository. It takes the email
as an optional argument: `npm run admin:create -- orit@example.com`.

There is one app and one dev server. No separate API process.

## The design system at `/admin/dev`

`http://localhost:3000/admin/dev` renders the whole design system: every colour
on the surface it is meant to be used on, the spacing and radius scales, the
interactive states, and the real artwork component across all three
orientations and all four statuses.

It reads no painting data and no real content, so it stays reviewable however
little of the site is built — and it is the fastest way to see whether a token
change broke something. It is a permanent developer tool, not a scratch page.

**It needs a signed-in admin session** since 29-09-2026, like every other admin
page, and it is reachable in production builds and on deploy previews for
whoever can sign in there. It used to live at `/dev`, open to anyone; it moved
under `/admin` because the session cookie is scoped to that path, so a guard
anywhere else never sees a session. `/dev` now goes where any unknown path
goes — to `/he/dev`, and a 404 — and nothing points at the new address.

It has its own route group, `app/(dev)/`, for its own root layout — an English,
left-to-right document rather than the admin's Hebrew shell — and
`scripts/check-admin-guard.mjs` scans that group as well as the admin's guarded
one. Being under `/admin` also puts it under the admin's `robots` disallow and
`X-Robots-Tag` header, beside its own `noindex` metadata. Its placeholder
images are files in `public/admin/dev/`, so they are public like everything in
`public/` — they are generated colour swatches, and nothing else.

## Linting

`npm run lint` does seven things in order: `eslint .` over every JS/MJS file in
the project — including `proxy.js`, the config files and `scripts/` — then
`scripts/check-contrast.mjs`, the palette guard, then
`scripts/check-admin-guard.mjs`, which fails if any page in the guarded admin
group or the design system's `(dev)` group does not call `requireAdminSession`, then `scripts/check-sitemap.mjs`,
which fails if the sitemap offers a stub or omits a finished page, then
`scripts/check-image-crop.mjs`, which fails if the image loader would ask the
host to crop a painting, then `scripts/check-page-headings.mjs`, which fails if
a public page renders no `<h1>`, then `scripts/check-locale-strings.mjs`, which
fails if the locale files hold different keys or a string nothing reads.

All six guards are advisory in the same way lint is: they are **not** in the
build and cannot fail a deploy. That is deliberate for the palette. For the
other five it is a real limitation worth knowing — a page added without the
guard ships, a stub listed in the sitemap ships, a cropping transformation
ships, a page with no heading ships and a string nothing renders ships, and the
checks only complain when someone runs them.

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

## The heading guard

`npm run check:headings` fails if any `page.js` under `app/(site)/[locale]/`
renders no `<h1>`. The homepage and the gallery shipped without one — WCAG
1.3.1, Level A — and nothing on screen showed it.

Almost no page writes the tag, so it follows imports: a component counts when
its own source writes `<h1` or passes `as="h1"`, or when it renders one that
does. That is worked out from the source on every run rather than kept as a
list, so taking the heading out of `Hero` fails the homepage. **Comments are
stripped first** — several say `<h1>` in prose, and a comment claiming a heading
is exactly what outlives one. It checks that a page renders a heading
somewhere, not on every branch of a conditional.

## The strings guard

`npm run check:strings` does two things. **Parity:** every file in
`lib/i18n/locales/` must hold the same keys. **Usage:** every key must be read
by something in `app/`, `components/` or `lib/`. The case it exists for is
`checkout.errorRequired`, written in both files and rendered by nothing until
17-09-2026. Its first run found thirteen more, every one superseded, and they
were deleted.

It follows the dictionary under `dictionary`, anything from `getDictionary()`,
local aliases (`const copy = dictionary.checkout`) and slices handed to another
component as props. Handing a slice on is not a read; what the receiving end
reads is. **A computed lookup counts as reading its whole prefix** —
`dictionary.status[work.status]` reads every status, because data can arrive
from anywhere — **unless the file itself names the keys it can hold**: a
property called `…Key` (`copy[field.labelKey]`) or a constant map declared
beside it (`ALT_TEMPLATE_BY_TYPE`). Without that exception those two lookups
would count all of `checkout` and `artwork` as read. Every computed lookup is
printed with how it was counted.

**When it finds a string, render it or delete it — never loosen the check.**
What it cannot see errs towards passing: a slice passed to a plain function
rather than a component, or two things sharing a name in one file.

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

**The rail runs the other way in production**: a test terminal there is refused
too, because a buyer on the live site would pay nothing and be sent a painting.
The one exception is `HYP_ALLOW_TEST_TERMINAL`, **production only, normally
absent**, which lifts it when set to exactly `true` — for the pre-launch
walk-through on the real domain and nothing else. It comes off before launch;
deployment.md has it on the checklist beside the override.

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

A **local Postgres**, created by hand in pgAdmin, called `art_studio` — and
since 12-09-2026 a **Neon project for production** as well: "Orit's gallery",
US East (Ohio), PostgreSQL 18, carrying 001 through 015 (011 and 012 since 28-09-2026, 013 since 29-09-2026, 014 since 30-09-2026, 015 since 26-10-2026) and both admin
accounts.

Development stays on the local one. **The Neon connection string is not in
`.env.local` and not anywhere in the repository**; it is taken from the
environment for the one command that needs it. Migrations and scripts use
Neon's **direct** endpoint, the deployed application its **pooled** one.

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
