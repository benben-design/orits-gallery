# Security

- Every database query is parameterized. Never interpolate input into SQL.
- Secrets live in environment variables and never in the repo. `.env.example` at
  the repo root is that template and is committed, so every value in it is a
  dummy; the real `.env.local` is git-ignored by the `.env*.local` rule. Add a
  key to the example in the same change that starts reading it.
- **There are two admin accounts — the artist's and the developer's — with
  equal rights.** Nothing may assume a single row. There is no role column, so
  either account can change or delete the other; that is a deliberate choice for
  two people who know each other, not an oversight.
- **Email uniqueness is case-insensitive**, enforced on the lowercased address.
  Lookups must match the same way or they will not use the index — and a login
  that fails on capitalisation is indistinguishable from a forgotten password.
- **Only a password hash is ever stored.** There is no plaintext column and
  adding one is not a shortcut worth taking under any deadline. Hashing happens
  in the application, never in SQL: a password passed to a database function is
  a password in the query log.
- **Passwords are hashed with scrypt, in `lib/auth/password.js`.** That module
  is the only place hashing or verification happens. Node's built-in crypto, so
  no dependency. The stored value is self-describing —
  `$scrypt$N=65536,r=8,p=1$<salt>$<key>` — which is what lets the cost be
  raised later without resetting a single password: verification reads the
  parameters out of the value rather than assuming today's constants.
  Verification compares with `timingSafeEqual`, because a plain `===` leaks how
  much of a guess was right through how long the comparison took.
- **Accounts are created by `npm run admin:create` and by nothing else.** There
  is no signup route, and there must not be one. The password is typed at a
  prompt with the echo off; it is never an argument, an environment variable or
  a file, and the script refuses to run without a terminal so that those remain
  impossible rather than merely discouraged. **There is no default password
  anywhere in this repository** — a documented default is a password every
  reader of the git history already knows.
- **Signing in and out are built.** The form is a Server Action, so no endpoint
  exists that could carry a credential in a URL, and a failed attempt returns
  the same message and does the same work whether the address is unknown or the
  password is wrong — see the decoy hash in `lib/auth/admin-users.js`. Nothing
  about a failed attempt is logged; a log of attempted addresses is a list of
  admin accounts.
- **The route guard is built, and it guards rendering only.** Every page under
  `app/(admin)/admin/(guarded)/` calls `requireAdminSession()` from
  `lib/auth/admin-guard.js` as its first statement; without a valid session the
  request redirects to the login page and the page body is never produced. It
  verifies the cookie's signature and expiry and reads no database.
  **So does the design system**, at `/admin/dev` in its own `app/(dev)/` group
  (its own root layout), since 29-09-2026. It was open to anyone at `/dev`, and
  it moved rather than being guarded in place because a guard at `/dev` could
  never see a session — the cookie is scoped to `/admin`. `/dev` now 404s like
  any unknown path.
- **A guard at the rendering layer is not a security boundary.** This is the
  sentence to remember: it runs when a *page* renders, and nothing else. It does
  **not** run for route handlers under `app/api/`, and it does **not** run for
  Server Actions — an action is a POST endpoint that Next reaches directly, and
  the page guard has no say in it. So:

  > **Every admin mutation written from here on must verify the session
  > itself**, in its own first lines, whatever guards the page that renders its
  > form. A form behind a guarded page is not a protected write; the guard
  > protected the form, not the endpoint.

  Concretely: a new Server Action in `app/(admin)/admin/actions.js` starts with
  its own `readAdminSession()` check and returns without writing if there is
  none. `signIn` and `signOut` are the exceptions that prove it — one must work
  signed out, and the other only removes a cookie.
- **The same rule covers a read that costs money.** `/admin/api/translate` is
  the first route handler in the admin and it writes nothing at all, so the
  sentence above about *mutations* does not reach it. It still verifies the
  session in its first statement, because an unguarded one is a free
  translation service for the internet billed to us, reachable without ever
  loading a page. Two details go with it: it sits **under `/admin`** so the
  path-scoped cookie actually arrives, and the provider key is read only in
  `lib/translate.js`, on the server. A key the page can reach is a key anyone
  can spend.
- **Image upload is signed, and there is no unsigned preset.** The file goes
  from the browser to the image host without passing through this server — a
  Server Action's request body is capped at 1MB and a photograph is several
  times that — so the thing to get right is what authorises it.

  The provider offers an *unsigned upload preset*, which needs no server at all
  and is therefore a public write endpoint into the artist's media library:
  named in the page source, usable by anyone who views it, for as long as it
  exists. **Do not add one.** `signMainImageUpload` verifies the session and
  then signs one upload, and the signature covers **every** parameter the host
  receives — so a browser that adds a `public_id`, a tag or a transformation of
  its own invalidates it rather than sneaking it past. Only the folder and a
  timestamp are signed, and the timestamp is an expiry: the host refuses a
  signature older than an hour, so one that leaks out of the page stops working
  on its own.

  **The folder is chosen by the signing action, never by the browser.** There
  are two — `orit-works` for paintings and `orit-site` for the artist's
  portrait, kept apart because the planned automation treats the paintings'
  folder as a queue of new works. `signPortraitUpload` passes its key in its own
  body, and `savePortrait` refuses any asset outside the portrait folder, so a
  browser cannot have a painting's photograph recorded as her portrait.

  **Nothing the browser reports about the finished upload is believed.** It
  hands back an identifier; the server asks the host for the asset under its own
  credentials and stores the width, the height and the URL from that answer.
  This is the ordinary rule — never trust a value from the client — applied to a
  case where it is easy to forget, because the client just did the work and
  obviously knows the answer. It also has a concrete failure mode rather than a
  theoretical one: pixel dimensions reserve the box a painting is drawn in, so a
  wrong pair from a hostile or simply buggy client is a broken public page.

  **There are two call sites, and the second is the one to be careful about.**
  Editing a work binds its id into `saveMainImage` server-side, so a finished
  upload cannot be repointed. *Creating* one has no id to bind, so the uploaded
  reference travels as an ordinary form field — which the browser can edit to
  name any asset in the account, or something that is not an asset at all. That
  is fine, and it is fine for exactly the same reason: the identifier is all
  that is taken from it. `createWork` calls `readUploadedImage` on it too, and a
  reference the host does not recognise stops the save rather than writing a
  broken row. **Do not add a third path that skips that call.**

  The credentials are read only in `lib/image-host.js`, on the server, and the
  API secret never reaches the browser. The API key does, in the signed fields,
  and that is by the provider's design — it names whose secret to check against
  and authorises nothing on its own.
- **`generateMetadata` runs even when the guard redirects**, because it is a
  separate export from the page component and Next calls it either way. It was
  measured: a signed-out request to `/admin/orders` returns a 307 whose body
  carries no page markup at all, but does carry
  `<title>הזמנות · אזור ניהול</title>`. Today every admin title is a fixed
  dictionary string, so nothing leaks. The rule that keeps it that way:
  **never build an admin page's metadata out of record data.** A title like
  "Edit: Lemons · Admin" would tell someone with no session that a work by that
  name exists, and the guard would not stop it.
- **Sign-in is rate limited, and the counter is in Postgres.** scrypt bounds
  someone working through a stolen database; it does nothing about someone
  posting to the login form in a loop, and `lib/auth/login-throttle.js` is what
  does. Five consecutive failures block further attempts for a minute, escalating
  to fifteen; a successful sign-in clears it. **A blocked attempt verifies no
  password at all** — a limit that runs scrypt and then declines to look at the
  answer costs the server as much as no limit.

  Three details are load-bearing rather than incidental:

  - **The counter is keyed on the submitted address *and* the client address,
    not either alone.** Address alone lets a stranger lock the artist out of her
    own account by hammering it; source alone is defeated by rotating. A looser
    ceiling per source, across all addresses, bounds working through a list.
  - **And one counter on the address alone, across every source — a trade
    taken deliberately on 28-09-2026.** The pair key has a hole: every rotated
    source is a fresh pair, so someone who can vary the source never reaches
    the pair threshold, and nothing counted per address at all. On Netlify the
    source cannot be forged — since 29-09-2026 it is read only from
    `x-nf-client-connection-ip`, which Netlify was measured to overwrite (see
    deployment.md) — so varying it means genuinely using many machines. The
    comment in `lib/auth/client-ip.js` that claimed otherwise was wrong.
    Migration 012 adds the counter: **20 failures on one address within 60
    minutes block that address from every source for 15 minutes**, with the
    same message as every other block.
    **What it costs, accepted knowingly: a stranger who knows the artist's
    address can keep her out of her own admin fifteen minutes at a time**, for
    as long as they keep sending twenty wrong guesses an hour. That is precisely
    what the pair key was designed to avoid, and it is accepted because the
    alternative is an unbounded guess rate against her account. The block is
    flat, never laddered past fifteen minutes, and **a successful sign-in
    clears it**, from whichever source it comes. Only the correct password can
    do that, so it hands an attacker nothing — whoever can clear it can already
    sign in — and it stops one typo of hers, just after an attack, from blocking
    her for another fifteen minutes.
  - **Failures are counted against the address as typed, whether or not an
    account exists.** Throttling only real accounts would make the site behave
    differently for an address that exists, which is precisely what the shared
    error message and the decoy hash in `admin-users.js` are arranged to avoid
    saying.
  - **It must never move into memory.** Serverless hosting runs many short-lived
    instances, so an in-memory counter is per-instance and resets at random: it would pass
    every test on one laptop and do almost nothing in production. That is the
    worst kind of security control, the kind that reports success.

  The blocked message names no remaining time and reads identically for any
  address — a countdown is a progress bar for whoever is guessing.
- **This is what makes the eight-character password minimum acceptable.**
  `MIN_PASSWORD_LENGTH` in `lib/auth/password.js` was lowered from twelve for a
  non-technical operator, and eight characters would be thin protection against
  an unthrottled form. Against a form that stops after five wrong guesses, it is
  a reasonable floor. **The two are a pair: do not lower the minimum further, and
  do not remove the throttle, without revisiting the other.**
- **Checkout is rate limited per source, and the counter is in Postgres.**
  `submitCheckout` is the only write on the site that needs no session, and
  once Hyp is live every call that gets past validation also asks Hyp to sign
  a payment page. `lib/checkout/checkout-throttle.js` allows **5 orders per
  source per hour**, keyed on the same `readClientIp` the sign-in throttle
  uses, and never in memory, for the same reason. The check runs after
  validation and **before anything is written or signed**, so a refused source
  produces no order row and no call to Hyp. It counts orders created: a slot is
  given back when no order was written after all. A blocked buyer sees one
  sentence — try again later — and the artist's WhatsApp link when a number is
  set.
  **A client address is personal data, and it is removed rather than kept**:
  every row older than the hour is deleted, for every source, on each checkout,
  and nothing else reads the table. **There is no scheduler on this project,
  so that deletion only happens when somebody checks out — and at this site's
  volume a row can outlast the hour by days, until the next checkout.** That is
  the honest state of it. If it ever needs to be tighter, a scheduled deletion
  is the fix, not a longer explanation.
- **Which header is the client's was measured, not assumed** (29-09-2026, see
  deployment.md). In production `lib/auth/client-ip.js` reads Netlify's
  `x-nf-client-connection-ip` and nothing else; `x-forwarded-for` is read only
  in development, and **nothing reads `x-real-ip`**, which Netlify passes
  through exactly as the client wrote it.
- **Every response carries the security headers**, declared in
  `next.config.mjs` for the same reason as `X-Robots-Tag` (below): a Netlify
  header rule never reaches a response a function produced. On every path —
  pages, `/api` and `/admin` alike — since 29-09-2026:

  | Header | Value |
  |---|---|
  | `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: https://res.cloudinary.com; media-src 'self'; font-src 'self'; connect-src 'self' https://api.cloudinary.com; frame-src 'none'; frame-ancestors 'none'; form-action 'self' https://pay.hyp.co.il; base-uri 'self'; object-src 'none'` |
  | `X-Frame-Options` | `DENY` |
  | `X-Content-Type-Options` | `nosniff` |
  | `Referrer-Policy` | `strict-origin-when-cross-origin` |
  | `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
  | `Cross-Origin-Opener-Policy` | `same-origin` |

  No `X-Powered-By` (`poweredByHeader: false`), and **no HSTS: Netlify sends it**
  for every site, and a second copy could only disagree with it.

  **Every origin in the policy is one the code uses**, mapped from the repository
  with the file responsible: `res.cloudinary.com` is where every uploaded
  painting and the portrait are delivered from (`lib/image-loader.js`);
  `api.cloudinary.com` is the admin's browser uploading straight to the host
  (`components/admin/AdminImageUpload.js`, endpoint from `lib/image-host.js`);
  `blob:` is that same component measuring a file before it is sent;
  `pay.hyp.co.il` is checkout's redirect to the payment page, which without
  script follows a form post and is held to `form-action`. The two hosts that
  already have a constant — the payment page and the upload endpoint — are
  **imported** into the config from `lib/payments/hyp-endpoint.js` and
  `lib/image-host-endpoint.js`, never restated — modules holding only the host,
  because the config cannot load the `server-only` modules that read the keys. Fonts, the hero video and the local
  paintings are `'self'`: `next/font` makes no request to Google at runtime, and
  nothing plays from elsewhere, which is why `media-src` names no host and
  `img-src` has no `data:`. Links a visitor follows (WhatsApp, Instagram,
  Facebook, `mailto:`, `tel:`) are navigations CSP does not govern; calls the
  server makes (Gemini, Cloudinary's admin API, Hyp's signing and VERIFY) are
  not the browser's at all.

  **`script-src` allows inline script, and there is no nonce — a decided
  trade.** A nonce has to be fresh per response, so it makes every page
  dynamic: the prerendered homepage and the cached gallery would be rendered on
  every visit, against a database that sleeps after five minutes. What a nonce
  defends against is injected script, and there is nowhere for one to come
  from: **no user-supplied HTML is rendered anywhere, there is no
  `dangerouslySetInnerHTML`, React escapes everything else, and the admin is the
  only author** of anything the site displays. If any of those three stops
  being true, this trade has to be taken again.

  **Development differs in exactly two ways, and neither reaches a build**:
  `'unsafe-eval'`, which Next's development runtime needs, and the Hyp
  stand-in's origin in `form-action` while `HYP_ENDPOINT_OVERRIDE` is set. Both
  are gated on `NODE_ENV`, which is `production` for every `next build` and
  `next start`. Verified 29-09-2026 with no violation anywhere: the public
  pages on a production build, the admin in development, and checkout's
  redirect to the stand-in with and without JavaScript — plus a control proving
  the no-script redirect really is held to `form-action`. What cannot be
  verified until the first real transaction is the payment host itself; see
  deployment.md.
- **There is still no password-reset mechanism.**

## The session

A signed httpOnly cookie and **nothing else**. There is no session table, and
that is a decision rather than an omission.

The cookie holds `{ sub, exp }` — the account's uuid and an absolute expiry —
base64url encoded, with an HMAC-SHA256 signature over it keyed on
`ADMIN_SESSION_SECRET`. It is signed, not encrypted: the holder can read which
account it names, nobody can change it. The signature is compared in constant
time, and it is verified **before** anything in the payload is believed —
reading the expiry out of an unverified payload would be trusting a number the
holder chose.

**What this costs, accepted knowingly:**

- **An individual session cannot be revoked.** Signing out clears the cookie in
  that browser; a copy taken beforehand stays valid until it expires. Nothing
  server-side is tracking it.
- **Rotating `ADMIN_SESSION_SECRET` invalidates every session at once**, for
  both accounts, immediately. That is the only revocation mechanism there is,
  and it is the thing to do if a session is ever believed stolen.

Both were traded for two accounts, a fourteen-day expiry, and no per-request
database read. **Do not "fix" this by adding a session table without deciding
you want that cost** — it is a real change, not a missing piece.

The cookie's attributes are set in one place, `lib/auth/admin-session.js`:

| Attribute | Value | Why |
|---|---|---|
| `httpOnly` | always | Script on an admin page cannot read the session |
| `sameSite` | `lax` | Not sent on a cross-site POST, which is what stops another site submitting to an admin route in the artist's name |
| `secure` | outside development only | Refused over plain HTTP. Off in development because localhost is http — note that `npm run start` sets `NODE_ENV=production`, so a production build browsed over http://localhost will not keep the cookie. That is correct, not a bug |
| `path` | `/admin` | Not sent with public pages, images or the API |
| expiry | 14 days, absolute | No sliding refresh: using the admin does not extend it. A sliding window means a stolen cookie in regular use never expires |

**The path scoping has a consequence worth knowing before it bites: an admin
endpoint placed outside `/admin` never receives this cookie**, and will look
unauthenticated however correct its guard is. Admin mutations therefore live
under `/admin`. Server Actions post back to the page that rendered the form, so
they are already inside it.
- There is **one implementation** of the auth check — `requireAdminSession` for
  pages, `readAdminSession` underneath it — and it must cover **every** admin
  route and **every** mutation, not only the pages that render a form. An
  unguarded write endpoint is the whole breach. Note that "one implementation"
  is not "one call site": the page guard is called per page, for the reason
  given in `lib/auth/admin-guard.js`, and `scripts/check-admin-guard.mjs` is
  what keeps that from decaying into a page somebody forgot.
- Never trust an identity, a price, a status or a total from a request body. The
  server derives identity from the verified session and computes money from its
  own records.
- Validate against the exported constants — `WORK_STATUSES`, `WORK_CATEGORIES`,
  `IMAGE_TYPES` — rather than writing whatever value arrived.
- Uploads are constrained by type and size, and a file's own claimed name or
  content type is not evidence of what it is. **The type is enforced by the
  host, not by us guessing**: the upload signature carries
  `allowed_formats=jpg,jpeg,png,webp,heic`, so the host refuses anything else
  and a browser that drops the parameter invalidates the signature; and
  `readUploadedImage` refuses any asset whose detected `format` is not on that
  list, which also covers an asset named by the create form's field or
  uploaded through the host's own console. The host files PDF and SVG as
  images, which is what this keeps out. Verified 29-09-2026 against the real
  host: a signed GIF refused for its format, the same upload without the
  parameter refused for its signature, nothing created.
- **Every module that reads a non-public environment variable is marked
  `server-only`** — `lib/db.js`, `lib/auth/session.js`, `lib/translate.js`,
  `lib/image-host.js`, `lib/payments/hyp.js` — so importing one from a client
  component fails the build instead of shipping the key; proven with a
  temporary client import of `lib/db.js`, which stopped the build at the
  marker. Everything else that touches a secret imports one of these five. A
  new module that reads a secret gets the marker in the same change. Plain
  Node cannot load a marked module without `--conditions=react-server`, which
  the two admin scripts are run with; `next.config.mjs` takes its hosts from
  `hyp-endpoint.js` and `image-host-endpoint.js` instead.
- **`ADMIN_SESSION_SECRET` cannot be the template's placeholder.** The value in
  `.env.example` is public and 33 characters long, so the length check alone
  accepted it — and on `main` a session forged with it verified. `readSecret`
  now refuses it, and anything carrying its wording, when signing; verifying
  under it returns null, so every session fails closed.
- **Payment state is written only by our own server, and only after the
  provider's VERIFY call has validated the redirect.** This amends a stricter
  rule that could not be implemented here: Hyp Pay at our tier has no webhook
  and no transaction-status query, so a verified redirect is the only completion
  signal that exists. api.md carries the full amendment.

  What survives unchanged is the half that matters: **nothing the browser hands
  us is believed on its own say-so.** Before VERIFY answers, the redirect's
  parameters are an input to VERIFY and nothing else — not the amount, not the
  status, not which order it was. After VERIFY confirms Hyp's signature over
  them, they are Hyp's signed statement and are read as one: the payment's
  `CCode`, the `Order` and `Amount` it was for, and the `Id` that names it
  (amended 28-09-2026; VERIFY itself answers `CCode` alone). A charge that does
  not match its order at exactly its total is voided, never settled. A return
  carrying one of our own keys, or any key twice, is refused before VERIFY is
  asked. A redirect that fails verification writes nothing at all, and an order
  with no verified return stays `pending` until a human reconciles it against
  the Hyp console. An order wrongly marked paid is a painting given away; an
  order left pending is a phone call.
- Errors shown to a user say what to do next; stack traces and internal detail go
  to the server log only.
- The admin is excluded from indexing in two places — `robots` and an
  `X-Robots-Tag` header. Keep both, and keep the header **in
  `next.config.mjs`**. The host's own header rules are applied only to responses
  it serves from its store and never to one a function produced, so a rule moved
  there would read as protection and provide none — and every admin route is
  server-rendered, which is exactly the case those rules do not cover.
