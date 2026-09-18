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

### The move off Vercel, done on 17-09-2026

**This project was going to deploy to Vercel and the decision changed.** The
repository now carries the Netlify side of that decision and nothing of the old
one. Nothing is deployed yet, so what follows is proven against a local
production build rather than against the host.

- ~~**Replace the old Vercel configuration file.**~~ **Deleted.** Exactly one thing in it had a
  consequence — the `X-Robots-Tag` headers, below. Nothing else had a successor
  to carry over: Netlify detects the framework on its own, and region selection
  is a paid-plan feature this project has no access to.
- **Those headers are declared in `next.config.mjs`, not in `netlify.toml`, and
  that distinction is the thing to remember from this whole migration.**
  Netlify's custom headers — written in its own configuration file or in a
  `_headers` file — are applied only to responses it serves **from its own
  store**. They are never applied to a response produced by a **function**,
  which is what every server-rendered route is; and every route under `/admin`
  is server-rendered, because the admin's root layout reads the session cookie.
  Porting the rules into host configuration would therefore have produced
  precisely what this section exists to prevent: **a file that reads as
  authoritative and does nothing.** Declared in the framework, the header is
  part of the response whatever rendered it.
  The one documented difference is that headers declared there are evaluated
  **after** the proxy rather than before, and it cannot matter for these two
  paths, because `proxy.js`'s matcher deliberately excludes both `/admin` and
  `/dev`.
- **`netlify.toml` carries four settings and deliberately nothing else**: the
  build command exactly as `package.json` defines it, `NODE_VERSION = "22"`,
  and two that narrow the secrets scan — see "The secrets scan is narrowed,
  never disabled" under Build below. The framework, the publish directory and function bundling are all detected,
  and a value restated there is one that can quietly disagree with the manifest
  later. **Node is pinned because the host's default moves with its build
  image**, and a major version changing underneath a build is a failure that
  arrives on a day nothing was pushed, with nothing in the diff to explain it.
  22 is the line this project is developed on; Next 16 requires 20.9 or newer,
  so that is the floor rather than the target — matching development is what
  makes a green build on a laptop mean something about a build on the host.
- ~~**Confirm whether a region can be pinned near Israel.**~~ **Answered, and
  closed on 12-09-2026 — and the answer reverses the instinct behind it.**
  The Vercel configuration pinned `fra1` (Frankfurt) for latency to an Israeli
  audience.
  Netlify runs functions in **US East (Ohio)** by default and region selection
  is a Pro-and-above feature, so there is no equivalent to carry over on this
  plan. The database is therefore placed **next to the functions rather than
  near the visitor**, and Neon's "Orit's gallery" is in US East (Ohio) for that
  reason. **Queries per page are what multiply**; the visitor pays one long hop
  for the HTML either way, and a Frankfurt database would have made every query
  on every page cross the Atlantic instead. Reopen this only if the functions
  ever move.

## Build

`prebuild` regenerates the image manifest, so the deployed build always matches
the images actually in the repo.

### The secrets scan is narrowed, never disabled

The first production build, of `dc1519a`, compiled cleanly and then failed at
Netlify's "Scanning for secrets in code and build output" step, with exit code
2. **Nothing was published, so nothing leaked and no key needed rotating.** The
scan found two different kinds of thing, and they are handled differently:

- **The four real secrets were each in exactly one file.**
  `ADMIN_SESSION_SECRET`, `GEMINI_API_KEY`, `CLOUDINARY_API_KEY` and
  `CLOUDINARY_API_SECRET` appeared in `.netlify/.next/cache/turbopack/…/*.sst`
  and nowhere else. That is **Turbopack's persistent build cache**, new in
  Next 16, which records the values of environment variables read during the
  build. It is not served and not uploaded to the CDN: the deploy is the pages,
  the static files and one function, and the cache is saved separately. So
  `SECRETS_SCAN_OMIT_PATHS` names that cache — `.next/cache/`, where Next
  writes it, and `.netlify/.next/cache/`, where the scan found it — **and
  nothing wider.** The scanner matches each entry as a prefix of the file's
  path from the base directory (or as a glob), so the trailing slash keeps each
  entry to that directory. **Never widen it to `.next`**: the served pages are
  generated there, and that is exactly where a leaked secret would show up.
- **`CLOUDINARY_CLOUD_NAME` was everywhere**, which is correct: in every
  generated page, in the deploy blobs, in migration 008 and in
  `scripts/check-image-crop.mjs`. It is not a secret. It is the public
  identifier inside every delivery URL, so it has to be in the output, and it
  can never be cleaned out of the repository, which the scan also covers.
  `SECRETS_SCAN_OMIT_KEYS` names it **and nothing else.** The Cloudinary API
  key and API secret are real secrets and must never be added.

**The cloud name was only scanned because of a wrong label.** The scanner
searches only for the values of variables marked "Contains secret values", so
the cloud name must be marked that way in the Netlify UI. That label is wrong
for a public identifier. Fixing the label in the UI was an option, and the
exclusion was kept in `netlify.toml` instead, deliberately, because there it
can be seen in the diff and it goes on working if someone marks the variable
secret again.

**`SECRETS_SCAN_ENABLED = false` was rejected.** It would have fixed this in one
line and thrown away the one check that matters: a secret reaching a page that
is served. Both settings are in `netlify.toml` rather than the Netlify UI
because the repository is going public, and an exception to a security check
has to be visible in the diff with its reason next to it.

**This cannot be checked on a laptop.** Secrets scanning is a Netlify build
step and does not run locally, so a green local build proves nothing here. The
check is the next production build: the scan should report zero instances and
the deploy should reach published. **If it fails again on any of the four, that
is not noise.** One of them has reached something outside the build cache,
most likely a served page, and it needs tracing before anything else changes,
starting with these exclusions.

## Database — Neon

**Connected, as of 12-09-2026.** The production database is a Neon project
named **"Orit's gallery"**, region **US East (Ohio)**, **PostgreSQL 18**. It
carries migrations **001 through 010**, the catalogue, and **both admin
accounts**. Development is unchanged and stays on the local Postgres.

**That is not the same as being deployed.** `DATABASE_URL` is set on no host,
so nothing has ever pointed at it but a developer's own shell. `lib/db.js`
throws when the variable is unset, so the blocker on a deploy is now that
variable rather than the database behind it.

**Two endpoints, and the deployed site does not use the one the migrations
did.** The application reads the **pooled** endpoint; migrations and scripts
use the **direct** one, which is the same host without `-pooler`. The reason is
connection count: many short-lived serverless instances, each holding a pool of
its own, against a small Postgres.

**The connection string is nowhere in the repository**, `.env.local` included.
It lives in the Neon console, and in the Netlify site once there is a
deployment. A script that needs it takes it from the environment for the one
command that needs it, rather than from a file.

**The catalogue travelled with the migrations.**
`008_load_catalogue_data.sql` carries the sixteen works and their images, so
applying 001 through 010 in order brought Neon to the catalogue as it stood
when 008 was generated, and that is how it got there.

**008 has now run, so it is frozen — in fact, not only by convention.** Its own
header sets out what that means: it is never edited, and a refreshed catalogue
goes into a **new numbered file**. Forward-only stops being a style preference
the moment a file has been applied somewhere.

**To move a newer catalogue across, take a dump rather than rewriting 008:**

```bash
pg_dump --data-only --table=works --table=work_images "$LOCAL" | psql "$NEON"
```

It is current by construction, where 008 is current only as of the day it was
written. 008 exists so that the catalogue is in version control and a fresh
database needs nothing but the migrations; neither route is the thing to run
against a Neon that already holds the catalogue, which is now the case.

**008 is the only migration that is not ASCII**, because its data is Hebrew.
Run it with a UTF-8 client — its header says how — or psql on Windows aborts it
mid-statement.

The connection string goes in `DATABASE_URL` in the Netlify site when there is
a deployment, and every migration in `database/migrations/` is applied to Neon
**by hand, in numeric order, as a deliberate step of deploying** — never
assumed to have happened. There is no runner and no ledger table, so the only
way to know what a given database has had applied is to ask that database, and
there are two to ask now.

Two hazards specific to having two databases, **both of them live from
12-09-2026 rather than hypothetical**:

- **The local database and Neon can drift.** Every migration from here is
  applied to **both**, deliberately. Applying one locally does nothing to
  production, and a deploy that ships code depending on a new column before
  that column exists in Neon fails at runtime, not at build time.
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

The three `HYP_*` keys are the payment terminal's, and they behave differently
from every key above: **they are needed as a set, they are read server-side
only, and the two environments use two different terminals.** Development runs
against Hyp's documented test terminal; production uses the real one, which is
provisioned separately and carries its own monthly cost. Getting this wrong in
the safe direction is harmless and in the unsafe direction is not — test
credentials in production means no payment can complete, and production
credentials in a preview deployment means a real charge against a real card.

Two things the payment integration needs are **not environment variables at
all**, and both are easy to lose track of because they live in somebody else's
console: the payment-page **signature** setting and the success and failure
**return URLs** are terminal-level settings in Hyp. The signature has an
ordering trap — switching it on before our verification code is built and tested
makes every test transaction fail with nothing to explain why. See api.md.

## The payment return: what is proven, and what is not

**There is no Hyp account yet**, and there will not be one until the site is
otherwise ready to sell — registration and the second terminal are the last step,
not the first. The whole return path is nonetheless built and exercised, against
a local stand-in that answers the two calls the application makes. This section
is the honest ledger of which half is which, so nobody has to guess later.

### Proven, without the provider

Against simulated returns, end to end through the real routes, the real
transaction and the real database:

- A **forged** return claiming success changes nothing — no order moves, no
  painting is sold, no cookie is cleared.
- **Missing credentials never read as success.** With no `HYP_*` at all — the
  project's actual state today — every return takes the "not confirmed" branch.
- A **declined** `CCode`, an **HTML** body, an empty body, a body with no `CCode`
  and a 500 carrying `CCode=0` are each refused, and each changes nothing.
- A **verified success** seizes the paintings conditionally, marks the order paid
  with its date and reference, and clears the cart — in that order.
- A **refreshed** return URL writes nothing a second time.
- The **race**: a painting sold between order and return triggers the losing
  branch, attempts the void, and records either `cancelled` or a `refund_due_at`
  — with the other buyer's sale untouched.
- The redirect's parameters reach VERIFY **in their original order**, with our
  credentials in front of them.

### Not proven, and cannot be until the account exists

- **That Hyp accepts the VERIFY request as assembled.** The shape follows the
  documentation — our five parameters, then the return's query verbatim — but no
  real terminal has ever answered it. If Hyp's return carries its own `action`,
  `Masof`, `KEY`, `PassP` or `What`, the pairing produces a duplicate key and has
  to be revisited. The documented return fields contain none of them.
- **The cancellation call.** `CancelTrans` fires on the losing branch and its
  handling is proven, but **the parameter name carrying the transaction id is
  unconfirmed** — it is sent as `TransId`. The docblock on `cancelTransaction` in
  `lib/payments/hyp.js` is the flag. If it is wrong, the void fails and the order
  correctly falls back to `refund_due_at`: the failure mode is a manual refund,
  never money silently kept.
- **`zikoyAPI`**, the refund for any day but the day of the charge, is not built
  at all. An owed refund is made by hand.
- **Which field carries the transaction id on the way back.** The reference is
  read from the VERIFY response as `Id`, falling back to `TransId`.

### What has to be done on the terminal, at that point

1. **Set both return URLs.** They are terminal-level settings; nothing in the
   code can supply them.

       success   https://<site>/api/payments/hyp/return
       error     https://<site>/api/payments/hyp/error

   Both run the same handler, deliberately — VERIFY's answer decides the outcome,
   not which URL the browser landed on.
2. **Switch the payment-page signature ON — and only now.** The verification code
   is in place, which is the precondition that ordering exists for. Turning it on
   before it existed would have failed every test transaction with nothing to
   explain why.
3. **Find out whether the terminal requires an Israeli ID (`UserId`).** Hyp's own
   documented response example carries one, and **the checkout form does not
   collect it.** If the terminal demands it, the form needs a field, the order
   probably needs a column to keep it, and both are a change to the checkout
   rather than to the return. Check this in the console before the first real
   transaction, because it is the one open question that can invalidate a form
   that is otherwise finished.
4. **Delete the development-only endpoint override.** `HYP_ENDPOINT_OVERRIDE` in
   `lib/payments/hyp.js` exists solely to make the above provable before the
   account existed. It is ignored in production, so it is not a hole — but it
   stops earning its keep the day there is a test terminal to point at.
5. **Walk one real transaction end to end**, in both languages, including closing
   the window mid-payment. That branch leaves an order pending with money taken
   and only the Hyp console can see it.

## Before going live

Beyond a green build, these are launch blockers and are easy to forget:

- **Real photography — mostly done, not finished.** Fifteen of the sixteen now
  serve the artist's own originals from the image host rather than the
  WhatsApp-compressed stand-ins. What is left is that these are marketplace
  listing photographs, several shot with the frame in view, and `detail` and
  `in-situ` images still do not exist. The original wording follows.
- **Real photography.** Every image in the repo today is a compressed stand-in.
  The admin can now replace them one at a time — see images.md — so this is
  sixteen edits by the artist rather than an engineering task, but it is still
  a blocker and it still has to actually happen.
- **Real content — largely done.** Titles, descriptions, dimensions, prices and
  media are the artist's own, from her under1000 listings, and the English
  descriptions are machine translations of her Hebrew, written without passing
  through the admin's approval gate — **so no human has read them yet.** Still
  outstanding: `year` is null on every work, and the **sale statuses are still
  demo data** —
  two works claim to be sold and two reserved, while under1000 lists all
  sixteen as available. The original wording follows.
- **Real content.** The placeholder dimensions, prices, years, media and
  descriptions are deliberately absurd so they cannot ship unnoticed. They must
  all be replaced.
- **The legal pages**, with real text: terms, shipping and cancellations,
  privacy, accessibility. See commerce.md.
- **A custom domain**, not the host's own preview URL.
- **Both languages walked end to end**, including checkout, in right-to-left.
- **A production database — done.** Neon's "Orit's gallery" carries 001 through
  010 and the catalogue, since 12-09-2026. **The blocker that replaces it is
  `DATABASE_URL` set in the Netlify site**, pointing at the **pooled**
  endpoint: until that variable exists, a deployed build still cannot render a
  single painting.
- **The two admin accounts — done.** Both exist in the Neon database, carrying
  the same scrypt hashes as the local rows, so the same passwords work against
  either. A hash is all that moved; no password was known to anything in the
  process. Creating an account locally still does nothing for production, which
  is the reason this was ever on the list.
- **`ADMIN_SESSION_SECRET` set in the Netlify site**, and a different value
  from the local one. Without it every admin page throws; with the local one
  copied over, a session minted on a laptop would work in production.
- **The paid hosting tier**, from the day the site can take money. See the plan
  at the top of this file: the free tier stops a site rather than billing for
  it, and cannot be topped up while it is off.
- **The production Hyp terminal**, provisioned and its three credentials set in
  the Netlify site — a second terminal under the same business, with its own
  monthly cost. The test terminal cannot take a real payment.
- **Both return URLs set on that terminal**, because they are console settings
  rather than per-transaction parameters and nothing in the code can supply them:

      success   https://<site>/api/payments/hyp/return
      error     https://<site>/api/payments/hyp/error

  They must be set per terminal, so the test terminal needs its own pair pointing
  at whatever host is being tested.
- **The payment-page signature switched on in that terminal**, and switched on
  **after** the verification code is built and tested rather than before. Until
  it is on, a forged redirect is a weaker thing to refuse; turn it on too early
  and every test transaction fails for no visible reason.
- **One real transaction walked end to end on the production terminal**, in both
  languages, including what the buyer sees if they close the window mid-payment.
  That branch leaves an order pending with money taken, and the orders list is
  the only place it can be caught — so it has to be seen working before a
  stranger meets it.
- **The `X-Robots-Tag` header confirmed on the deployed site**, not only in a
  local production build. It is declared in `next.config.mjs` and therefore
  carried by Netlify's Next adapter rather than by the host's own header rules —
  and the adapter honouring it is the one part of this a laptop cannot prove.
  `curl -I` an admin path and `/dev` on the deployed site and look for all three
  directives.
- **A check that the guard survived the deploy.** It is built, but it is
  ordinary application code rather than infrastructure: browse to an admin page
  signed out on the deployed site and confirm it lands on the login form.
