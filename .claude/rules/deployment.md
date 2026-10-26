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

While nothing is for sale — the deploy is Private and has no payment terminal —
the free tier costs nothing
and risks nothing. That changes on the first real customer, not on the first
busy week.

### The move off Vercel, done on 17-09-2026

**This project was going to deploy to Vercel and the decision changed.** The
repository now carries the Netlify side of that decision and nothing of the old
one. What follows was proven against a local production build on that date,
before anything was deployed; a production deploy has existed since, Private —
see "Database — Neon" below.

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
  **after** the proxy rather than before, and it cannot matter for the admin,
  because `proxy.js`'s matcher deliberately excludes `/admin` — the design
  system included, at `/admin/dev` since 29-09-2026.
- **`netlify.toml` carries five settings and deliberately nothing else**: the
  build command exactly as `package.json` defines it, `NODE_VERSION = "22"`,
  two that narrow the secrets scan — see "The secrets scan is narrowed,
  never disabled" under Build below — and, since 25-10-2026, **one header rule
  for the static files**: `X-Content-Type-Options: nosniff`, and nothing else,
  on what Netlify serves from its own store. That is the reverse of the rule
  below and not a contradiction of it — see "The response headers, measured". The framework, the publish directory and function bundling are all detected,
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
carries migrations **001 through 015** (011 and 012 since 28-09-2026, 013 since 29-09-2026, 014 since 30-09-2026, 015 since 26-10-2026), the catalogue, and **both admin
accounts**. Development is unchanged and stays on the local Postgres.

**A production deploy reads it.** The site is deployed on Netlify and is
**Private** — behind Netlify's team login, on the host's own address, with no
custom domain yet. `DATABASE_URL` (the pooled endpoint) and
`ADMIN_SESSION_SECRET` are set there; no `HYP_*` keys are, so its checkout says
buying is not open. It has been up since at least 29-09-2026, when the
client-address headers below were measured on it.

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

## The client address, measured on 29-09-2026

Both rate limits — sign-in and checkout — key on the client address, and which
header carries it on Netlify was an assumption until this date. It was measured
on the live deploy, signed in, through a temporary route
(`/admin/api/client-ip`, deleted once it had answered), once plainly and once
with every header forged by the client:

| Header | What Netlify did |
|---|---|
| `x-nf-client-connection-ip` | **Overwritten** with the real address. A forged value never arrives |
| `x-forwarded-for` | The client's value is **kept**, and Netlify appends after it: `"147.235.217.51, 63.178.53.27"`. The left-most entry is whatever the client wrote; the right-most is **Netlify's own edge address**, the same for every visitor |
| `x-real-ip` | Passed through **exactly as sent** |
| `client-ip` | Absent |

So `lib/auth/client-ip.js` reads **`x-nf-client-connection-ip` and nothing
else** in production, and falls into the shared unknown bucket if it is ever
missing. Neither end of `x-forwarded-for` identifies a client — the left is
forgeable, the right would put every buyer in one bucket — so production does
not read it; development reads its left-most entry only so a test can simulate
sources. **Nothing reads `x-real-ip`.** If the site ever moves host, this
measurement has to be taken again before either limit means anything.

## The payment return: what is proven, and what is not

**There is no Hyp account yet**, and there will not be one until the site is
otherwise ready to sell — registration and the second terminal are the last step,
not the first. The whole return path is nonetheless built and exercised, against
a local stand-in that answers the calls the application makes. This section is
the honest ledger of which half is which, so nobody has to guess later.

**The first stand-in flattered the code, and that is worth remembering.** It
answered VERIFY with a transaction id as well as `CCode`; the real API answers
`CCode` and nothing else. Every test passed, and against a real terminal every
order would have been settled with no reference, every void would have been
impossible, and the unique index on `payment_reference` would have protected
nothing. It was rebuilt on 28-09-2026 to model the documentation and no more:
VERIFY answers `CCode` alone, a repeated key keeps its **last** value, the
signature is a real HMAC over the redirect's fields, and `CancelTrans` answers
in its documented shape. It is disposable and lives outside the repository.
**A stand-in is only worth the documentation it models** — build the next one
from the docs, not from what the code expects.

### Proven, without the provider

Against the rebuilt stand-in, end to end through the real routes, the real
transaction and the local database, on 28-09-2026. Each of these **writes
nothing and sells nothing**, and VERIFY is never asked about the first five:

- a return with `What=SIGN` appended;
- a genuinely signed return with a second `CCode=0` appended;
- a return carrying `Masof`, `KEY`, or `passp` in lower case;
- an empty return;
- a **forged** return, and a signed return whose `Amount` was edited — VERIFY
  is asked, and refuses;
- a **genuinely signed decline** (`CCode` 33) arriving on the error URL —
  VERIFY passes, and nothing changes because it is not a charge.

And these do what they must:

- A signed return whose **`Amount` is below the order total** voids the charge
  with `CancelTrans` using the redirect's `Id`, sent **without `KEY`**; the order
  becomes `cancelled` with the reference and `paid_at` kept, **the painting stays
  available**, and the cart is kept. Refreshed, it writes nothing and does not
  void again. With the void failing, the order is `paid` with `refund_due_at`.
- A verified charge naming **no order we have** — in the shape of one of our
  ids — is voided, and nothing is written.
- **Since 30-09-2026**, a return whose `Order` is missing or not in the shape of
  one of our ids is refused **before the database is read or VERIFY asked**, and
  so is a source past 30 returns in an hour; both are logged under
  `REFUSED_UNVERIFIED`. What that gives up — a genuine charge whose `Order` a
  buyer edited is no longer voided automatically — is possible only while
  payment-page signing is off; see api.md.
- A **second genuine charge** — same order, same total, a different `Id` —
  against an order already paid is voided with that `Id`, and the order and its
  painting are left exactly as they were: no `refund_due_at`, the first
  reference kept. The same against a **cancelled** order is voided the same way.
  An `Id` equal to the stored reference is a refresh and does nothing.
- A return with a **`;`** in it — raw, or inside a value — is refused without
  VERIFY being asked.
- A **genuine success** marks the order paid with `payment_reference` set to the
  redirect's `Id`, sells the painting through this site, and clears the cart. A
  **refresh** writes nothing, and the same success arriving on the error URL
  writes nothing either.
- The **race**: a painting sold between order and return triggers the losing
  branch, calls `CancelTrans` with the redirect's `Id`, and records `cancelled`,
  or `refund_due_at` when the void fails — with the other sale untouched.
- A verified, matching success **with no `Id`** is settled with a null
  reference, logged at full volume, and the admin order page says the reference
  is missing; its refresh writes nothing.
- **Every response on both routes is `Cache-Control: no-store`**, all of the
  above included.
- **Missing credentials never read as success.** With no `HYP_*` at all —
  the project's actual state today — every return takes the "not confirmed"
  branch.
- A **declined** VERIFY `CCode`, an **HTML** body, an empty body, a body with no
  `CCode` or two of them, a 500 carrying `CCode=0`, and a SIGN-shaped answer
  (`action`, `Masof`, `signature`) are each refused — as pure functions, with
  the gate and the amount parser, fifty-odd cases in all.
- **The amount we send parses back to the same agorot**, over two thousand
  amounts, with no floating point either way.
- **In production a test terminal is refused** before anything is fetched,
  unless `HYP_ALLOW_TEST_TERMINAL` is exactly `true`; `TRUE` and `1` do not
  count. `HYP_ENDPOINT_OVERRIDE` is ignored there too.
- The redirect's parameters reach VERIFY **in their original order**, with our
  credentials in front of them.

### Not proven, and cannot be until the account exists

- **That Hyp accepts the VERIFY request as assembled.** The shape follows the
  documentation — our five parameters, then the return's query verbatim — but no
  real terminal has ever answered it. If a real return carries its own
  `action`, `Masof`, `KEY`, `PassP` or `What`, or any key twice, **every
  payment is now refused before VERIFY** and the order stays pending. The
  pre-launch transaction will show it; that is the safe way for this to be
  wrong. The documented return fields contain none of them.
- **The exact form of the redirect's `Amount`.** The documented example sends
  `10`; we send `1040.00`. Both parse. If a real terminal echoes anything else
  — a thousands separator, three decimals — every payment is treated as a
  mismatch and voided. Safe for the buyer's money, fatal for sales, and visible
  on the first transaction.
- **Whether a real success always carries `Id`.** The documentation shows it on
  every redirect. Without one a payment settles with no reference and nothing
  can void it automatically.
- **`CancelTrans` as sent.** Since 28-09-2026 it goes in the documented shape —
  `action`, `Masof`, `PassP`, `TransId`, and **no `KEY`** — where it previously
  sent `KEY` too. The field name is no longer a question (the documentation
  names `TransId`, carrying the redirect's `Id`), but **no real terminal has
  ever answered it, with or without `KEY`.** If it fails, the order correctly
  falls back to `refund_due_at`: the failure mode is a manual refund, never
  money silently kept.
- **That Hyp checks its signature over decoded values, not over raw bytes.**
  Measured on 28-09-2026: **Next rebuilds a request's query before any route
  handler sees it**, with form encoding — `request.url` and `request.nextUrl`
  alike. Hyp's own documented `Fild1=Jenny%20Parkington` reaches our handler as
  `Jenny+Parkington`; `~!()` arrive percent-encoded and a raw `;` as `%3B`. Keys,
  order and decoded values survive; the bytes do not, and there is no way for a
  route handler to recover them. So the replay to VERIFY is faithful in content
  and not in encoding. If Hyp verifies decoded values — the ordinary way for a
  server to do it, and what the stand-in does — this is invisible. If it
  verifies the raw text, **every payment fails VERIFY and stays pending**: the
  safe way to be wrong, and the first real transaction shows it, most visibly
  for a buyer whose name has a space in it. Netlify's adapter may re-encode
  again on top; that is unmeasured.
- **Whether Hyp signs decline redirects at all**, and what it sends to the
  error URL. A signed decline is handled; an unsigned one fails VERIFY. Both
  write nothing.
- **That `form-action` names the payment page's real host.** Since 29-09-2026
  the Content Security Policy allows forms to lead only to this site and to
  `HYP_PAYMENT_ORIGIN`, which `next.config.mjs` reads from `lib/payments/hyp.js`
  rather than restating. Without JavaScript, checkout's redirect to the payment
  page follows a form post and the browser holds it to that list; with
  JavaScript it is a script navigation and is not held to it. Proven in
  development against the stand-in, both ways, with a negative control: the
  stand-in removed from `form-action` and the no-script redirect **blocked**.
  What cannot be proven is that `pay.hyp.co.il` is the host a real terminal
  sends buyers to, and not a second host it redirects through. If it is wrong,
  a buyer **without script** is stopped on our page with nothing charged, and a
  buyer with script is unaffected. The first real transaction settles it,
  together with the VERIFY entries above — **walk it once with JavaScript
  switched off.**
- **That Hyp's signing answer does not echo our `KEY` or `PassP`.** The answer
  is appended to the payment page's address verbatim and the buyer is sent to
  it, so an echoed credential would land in every buyer's address bar. The
  documented example carries neither. Since 30-09-2026 `createPaymentPage`
  **fails closed** on one — by name in any case, or by value under any other
  name — as `credentialsInAnswer`: the order stays pending, the buyer is told
  payment is not available, and the log names the keys and never their values.
  It is never stripped and continued, because the signature may cover it.
  **Settled by the first test transaction**: if the refusal fires, no payment
  can proceed and Hyp has to be asked; if it does not, the signed URL is clean.

### Netlify copies the query onto a redirect (measured 25-10-2026)

**On Netlify, a redirect whose `Location` has no query of its own is sent with
the incoming request's query appended.** A return to
`…/api/payments/hyp/return?Order=x&Fild1=a` answered
`Location: …/he/checkout?Order=x&Fild1=a`, where the same build run locally
answers `…/he/checkout`. Netlify's staff call it expected, with no switch to
turn it off; a `Location` that already carries a query is left alone, which
the admin guard's `?next=` showed on the same day.

On the payment return that would have copied Hyp's whole redirect — which can
carry the buyer's name, email and phone — into the order page's address: the
browser's history, the screen, and any link the buyer copies to share. So every
redirect from `lib/payments/handle-return.js` now carries a query of its own,
`?from=payment`, which nothing reads. **It cannot be shown on a laptop**, so it
is checked on the deploy: a return with a made-up query must come back as
`…/he/checkout?from=payment` and nothing else. **Verified on the deploy the same
day**: five returns — none, one carrying a made-up name, email and phone, an
order-shaped id, a gate refusal, and the error route — each answered `307`,
`no-store`, and exactly `?from=payment` on the checkout or the order page, with
nothing of the request in it. The admin guard's and the artwork slug's
redirects were unchanged.

Every other redirect on the site carries only the visitor's own query onward —
`/he/art/lemons?x=1` keeps its `x=1` — which is harmless and left alone.

### Known residuals: refunds that exist only in the logs

Two paths end with money owed and **no row anywhere that says so**. Both were
chosen knowingly on 28-09-2026, and both log the same line, so one search finds
them:

    [payments] REFUND OWED — NOT RECORDED ON ANY ORDER

1. **A failed void of a duplicate charge.** A buyer who pays twice for one
   order, or pays for an order the artist has since cancelled: the second charge
   is voided and the order is deliberately left alone, because its first
   payment bought the painting and a `refund_due_at` would tell a buyer who owns
   it that it is unavailable. If that void fails, the log line — naming the
   transaction's `Id` — is the whole record.
2. **A refresh of that same return.** Nothing remembers which duplicates were
   voided, so a refresh sends `CancelTrans` again. It moves no money, but Hyp
   most likely answers `920` for a transaction already voided, which logs the
   same line for money that has already gone back. That line carries a note
   saying so, and the check is the transaction in the Hyp console before
   refunding anything.

The alternative — a table of voided transactions, migration 012, and an admin
surface — was considered and not built: it removes both residuals and was more
than a buyer paying twice and then refreshing warranted. Build it if the search
below ever finds something that is not a refresh.
- **`zikoyAPI`**, the refund for any day but the day of the charge, is not built
  at all. An owed refund is made by hand.

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
5. **Set `HYP_ALLOW_TEST_TERMINAL=true` for the pre-launch walk-through only, and
   remove it before launch.** Production refuses to sign against a test terminal
   without it, because a buyer on the live site would pay nothing and be sent a
   painting. It exists so step 6 can be run on the real domain against the test
   terminal, and it comes off the Netlify site the moment that is done — at the
   same time as the override above, and before the production terminal's
   credentials go in.
6. **Walk one real transaction end to end**, in both languages, including closing
   the window mid-payment. That branch leaves an order pending with money taken
   and only the Hyp console can see it. **Also send one return with the `Amount`
   edited on the payment page**, with the signature still off, and confirm it is
   voided rather than settled — it is the attack the matching exists to stop.

## Search engines are blocked until launch (since 25-10-2026)

**The whole site is hidden from search, and that is the default.** It went
Public on Netlify so the artist's family could see it long before it is a shop,
and a page indexed early is expensive to take back out of search. One switch
decides it: **`ALLOW_SEARCH_INDEXING`**, read by `lib/search-indexing.js`.
Indexing is allowed **only when it is exactly `true`**; unset, misspelt, `TRUE`
or `1` all leave the site blocked, so forgetting the switch can only ever hide
the site, never expose it.

While blocked, three layers say so:

- **`X-Robots-Tag: noindex, nofollow, noarchive` on every response** — the one
  that matters. Declared in `next.config.mjs`, beside the admin's own rule,
  for the reason everything here is: Netlify's header rules never reach a
  function's response.
- **A robots meta on every public page**, from the public root layout. Pages
  that already set their own (cart, checkout, an empty About or contact) say
  `noindex` either way.
- **`robots.txt` disallows everything and names no sitemap.** The sitemap still
  exists; it is only not advertised while crawlers are told to stay out.

**One limit, kept knowingly (25-10-2026).** Google says it plainly: when
robots.txt blocks a page, "the crawler will never see the `noindex` rule, and
the page can still appear in search results" — as a bare address with no
content, if Google finds a link to it somewhere it does crawl. So while the
disallow stands, the header and the meta are never read by a crawler that
obeys robots.txt; they protect only against one that ignores it. The
alternative — let search engines crawl so they read the `noindex`, while still
refusing everyone else — was weighed and not taken: the link is shared
privately (WhatsApp, a private profile), which no crawler reads, and the full
disallow also keeps AI crawlers from copying her paintings and words, which a
`noindex` would not. **If the address is ever posted somewhere public before
launch**, that is the moment to revisit it: allow `Googlebot` and `Bingbot`,
disallow `*`, and add `noimageindex` to the pre-launch header and meta.

The admin's own noindex rules, the security headers and the CSP are untouched,
and the admin stays blocked after launch exactly as before.

**It is read at build time.** The headers and the prerendered pages are fixed
when the site is built, so changing the variable on Netlify does nothing until
the next deploy.

**Measured on a local production build, 25-10-2026**: `robots.txt` is
`Disallow: /` with no sitemap line, and every response checked — both homes,
both galleries and a filtered one, an artwork page in each language, two legal
pages, About, contact, the cart, the admin login, the sitemap, `/api/health`
and a 404 — carries the header once, and every HTML page the meta.

**Before switching the Netlify project from Private to Public**, check the same
on the live deploy from a browser signed in to the Netlify team (a plain
`curl` only sees the team login while the site is Private): `/robots.txt`
says `Disallow: /`, and `/he`, `/en/gallery`, an artwork page and a legal
page each carry the `X-Robots-Tag` response header and the robots meta.

**At launch — the day the site should be found:**

1. Set `ALLOW_SEARCH_INDEXING=true` in the Netlify site's environment
   variables, for production only — never for deploy previews, which must stay
   hidden.
2. Trigger a new production deploy; the old one keeps the block.
3. Check the live site: `/robots.txt` allows `/`, disallows `/admin` and
   `/api/` and names the sitemap; a public page carries no `X-Robots-Tag` and
   no robots meta; `/admin/login` still carries both.

## Before going live

Beyond a green build, these are launch blockers and are easy to forget:

- **Search indexing switched on** — `ALLOW_SEARCH_INDEXING=true` and a
  redeploy, as above. Until then the site cannot be found, which is right
  before launch and a silent failure after it.

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
  outstanding: `year` is null on every work. **On Neon the catalogue matches
  under1000 as of 26-10-2026**: thirty-one works, all published, the demo
  statuses gone — every work available except the two under1000 shows sold,
  marked sold through under1000. The fifteen added that day were entered
  through the admin with her own under1000 English, lightly corrected. **The
  local database was not refreshed** and still holds the sixteen with their demo
  statuses. The original wording follows.
- **Real content.** The placeholder dimensions, prices, years, media and
  descriptions are deliberately absurd so they cannot ship unnoticed. They must
  all be replaced.
- **The legal pages**, with real text: terms, shipping and cancellations,
  privacy, accessibility. See commerce.md.
- **A custom domain**, not the host's own preview URL.
- **Both languages walked end to end**, including checkout, in right-to-left.
- ~~**Migration 012 applied to Neon — and to the local database — before the
  sign-in throttle change deploys or runs.**~~ **Done on 28-09-2026, on both**,
  before the merge that ships the code, and proven through
  `lib/auth/login-throttle.js` on each: all three counters write, a success
  clears them, and the constraints and indexes match. Kept here for its reason,
  which applies to any future database: Unlike 011 this one **does not
  fail the build**: nothing prerendered touches `admin_login_attempts`. It fails
  at runtime, on the first wrong password, because the throttle now writes a row
  with a null `ip` and 006's `not null` refuses it — so a missing 012 surfaces
  as the admin's sign-in erroring on a typo, on the live site, with nothing in
  the build to warn. Apply it first. A correct password still signs in without
  it, since success writes nothing.
- ~~**Migration 015 applied to Neon before the star ships.**~~ **Done on
  26-10-2026, on both**, before the merge that ships the star — on Neon from a
  session through its connector, then reconciled: `works_single_featured`
  gone, twelve works starred, none of them a draft, and they are exactly the
  twelve the live homepage was showing. Kept for its reason: like 012 to 014
  it does not fail the build — the homepage reads `featured` either way. It
  fails at runtime, the first time a second work is starred, on 001's
  one-featured index.
- ~~**Migration 014 applied to the local database and to Neon before the
  payment-return rate limit deploys or runs.**~~ **Done on 30-09-2026, on both**
  — locally from a session, where the catalog matched the file and the limit
  was exercised end to end, and on Neon by hand in its console, then reconciled
  from a session: the columns, the length check, the generated key and the
  `(ip, created_at)` index match the local database. Kept for its reason: Like 012 and 013 it does not fail the build — nothing
  prerendered touches `payment_return_attempts`. It fails at runtime, on the
  first return that passes the gate: the throttle throws, the handler's catch
  logs `RETURN FAILED UNEXPECTEDLY` and sends the buyer to their order page
  unverified. So a missing 014 is every paying buyer told their payment is not
  confirmed. Apply it first.
- ~~**Migration 013 applied to Neon — and to the local database — before the
  checkout throttle deploys or runs.**~~ **Done on 29-09-2026, on both**, before
  the merge that ships the code: the catalog matches the file on each (Neon, on
  PostgreSQL 18, also lists each `NOT NULL` as a named constraint, which 15
  does not), and a slot was reserved and released through the throttle module
  over the pooled endpoint. Kept for its reason: like 012 it does not fail the build:
  nothing prerendered touches `checkout_attempts`. It fails at runtime, on the
  first checkout that gets past validation, because the throttle reads and
  writes that table before the order is written — so a missing 013 is every
  buyer's checkout erroring at the last step. Apply it first.
- ~~**Migration 011 applied to Neon before this code deploys.**~~ **Done on
  28-09-2026**, applied from a session and reconciled against the local schema
  and read back through `getSiteSettings()`. The row on Neon holds only the
  seeded values — the WhatsApp number, 40 ILS, pickup on — so her About text,
  email, phone and portrait still have to be entered there. The public layout
  reads `site_settings` on every page, so a build against a database without it
  **fails, naming the migration** — verified on 27-09-2026 against a throwaway
  database carrying 001 through 010, where `next build` stopped with
  `SiteSettingsMissingError`. That is the safe failure: the previous deploy stays
  live. The same holds at runtime only for pages rendered per request; a
  prerendered page whose revalidation fails keeps serving its last good render.
- **A production database — done.** Neon's "Orit's gallery" carries 001 through
  013 and the catalogue, since 12-09-2026, and **`DATABASE_URL` is set in the
  Netlify site** on the **pooled** endpoint: the Private production deploy reads
  it.
- **The two admin accounts — done.** Both exist in the Neon database, carrying
  the same scrypt hashes as the local rows, so the same passwords work against
  either. A hash is all that moved; no password was known to anything in the
  process. Creating an account locally still does nothing for production, which
  is the reason this was ever on the list.
- ~~**`ADMIN_SESSION_SECRET` set in the Netlify site**~~ **Done** — the Private
  production deploy signs admins in. It must be a different value from the
  local one, and nothing checks that, so confirm it once. Without it every admin page throws; with the local one
  copied over, a session minted on a laptop would work in production.
- **The paid hosting tier**, from the day the site can take money. See the plan
  at the top of this file: the free tier stops a site rather than billing for
  it, and cannot be topped up while it is off.
- **A standing habit, from the first sale: after any day with a sale, search
  Netlify's function logs for this exact phrase**:

      [payments] REFUND OWED — NOT RECORDED ON ANY ORDER

  Each hit is money owed that no order records — see "Known residuals" above.
  Check the named `Id` in the Hyp console first: a hit carrying the `920` note
  is most likely a refresh of a charge already voided. The phrase is the
  constant `UNRECORDED_REFUND` in `lib/payments/handle-return.js`; change one
  and the other goes with it.

  **Search for this one beside it** (since 30-09-2026):

      [payments] RETURN REFUSED BEFORE VERIFICATION

  Each hit is a return that was never verified — the gate refused it, its
  `Order` was not one of our ids, the source was over the rate limit, or VERIFY
  refused it. Nearly all are noise, and none is evidence that money moved. One
  that names an order a buyer says they paid for is checked in the Hyp console.
  The constant is `REFUSED_UNVERIFIED`, in the same file.
- **`HYP_ALLOW_TEST_TERMINAL` and `HYP_ENDPOINT_OVERRIDE` absent from the
  Netlify site**, and the override deleted from `lib/payments/hyp.js`. The first
  is set only for the pre-launch walk-through on the real domain; see step 5 of
  the terminal list above.
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
- ~~**The response headers confirmed on the deployed site.**~~ **Measured on the
  public deploy on 25-10-2026** — see "The response headers, measured" below.
  Re-run it on the real domain at launch, and confirm the console shows no
  Content Security Policy violation on the pages walked.

### The response headers, measured on the public deploy (25-10-2026)

Once the site went Public, `curl` against it became the check, and it was run
on every kind of response:

- **Everything the Next runtime answers carries the full set** — the six
  security headers, Netlify's HSTS, the pre-launch `X-Robots-Tag`, and no
  `X-Powered-By`. Checked on twenty: both homes, both galleries, an artwork
  page in each language, About in both, contact, two legal pages, the cart,
  checkout, an unknown order, a 404, the sitemap, `robots.txt`,
  `/api/health`, `/admin/login` and the favicon. **Every HTML, JSON and XML
  response comes from the function**, so nothing a browser treats as a
  document is served without the policy.
- **The files Netlify serves from its own store carried none of them** —
  `/_next/static/*` and everything in `public/`: the paintings, the hero
  video and poster, the wordmark. That is the reverse of the rule at the top
  of this file, and it is just as absolute: `next.config.mjs` never reaches
  them. `netlify.toml` now gives them `X-Content-Type-Options: nosniff`, the
  one header that means anything on a non-document; the CSP and the framing
  headers govern documents, and `X-Robots-Tag` is not needed while robots.txt
  forbids crawling them (and not wanted after launch, when a painting is meant
  to be found). **Verified after the deploy**: `nosniff`, once, on a script, a
  stylesheet, the hero poster and loop, a painting and the wordmark — and every
  page still carries each of its headers exactly once, so the rule does not
  reach a function's response.
- **`/_next/image` is neither, and is left as it is.** Netlify's image CDN
  answers it, with its own `Content-Security-Policy: script-src 'none'` and
  none of ours — not even the `netlify.toml` rule. It serves only resized
  copies of the site's own files, never anything uploaded through it, with the
  right image type, so a missing `nosniff` there protects against nothing.

- **A check that the guard survived the deploy.** It is built, but it is
  ordinary application code rather than infrastructure: browse to an admin page
  signed out on the deployed site and confirm it lands on the login form.
