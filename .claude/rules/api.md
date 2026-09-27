# API

Two routes exist. This file records the conventions to build to, and the table
below is filled in as more land — the previous project kept a full method / path
/ body / returns table per area, and this should end up the same.

## The routes there are

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/api/health` | — | `{ status, works, dataIsPlaceholder }` | Liveness, and proof the repository and the database are reachable from a handler |
| POST | `/admin/api/translate` | `{ text, kind }` — Hebrew, at most 5,000 characters, and `title`, `description` or `about` | `{ ok: true, text }`, or `{ ok: false, error }` | The admin work form filling an English field in from its Hebrew twin. Verifies the session itself and returns 401 without one. 400 empty, unparseable or an unknown kind, 413 too long, 429 the provider is rate limiting, 503 no key or a key it refuses, 502 anything else |
| GET | `/api/payments/hyp/return` | — (Hyp's query string) | 307 to `/[locale]/order/[id]` | The terminal's **success** return. Calls VERIFY first and does nothing before it answers; on a verified success it seizes the paintings and marks the order paid in one transaction, then clears the cart. A route rather than a page for the cookie reason — only an action or a handler may set one |
| GET | `/api/payments/hyp/error` | — (Hyp's query string) | 307 to `/[locale]/order/[id]` | The terminal's **error** return, and it runs **the same handler**. Which URL the browser lands on is the provider's opinion; `CCode` is the fact. Ordinarily verification declines too and nothing changes — but a landing here that verifies as genuine is settled, because the alternative is keeping money on the strength of a redirect path |

Health predates the envelope and keeps its own shape; **`{ ok }` is the shape
every route from here on shares**, with `error` a *code* rather than a sentence,
exactly as the Server Actions return codes. The Hebrew lives in the locale files
and the browser picks it.

## Shape

API handlers live in the same app as the pages — public ones under `app/api/`,
admin ones under `/admin` for the cookie reason below. There is no separate
server process and no separate deployment.

**Prefer not to add an endpoint at all.** A server component reads through the
repository directly — no route, no fetch, no loading state.

For **writes**, there is a middle option this file originally did not name, and
it is now the default: a **Server Action**. A `'use server'` function passed to
a form's `action` runs only on the server, is reachable only by POST, and has no
URL of its own. Signing in is built this way — see `app/(admin)/admin/actions.js`
— and it is why there is no login endpoint. Two things fall out for free that a
hand-written one has to get right: a credential can never end up in a query
string, and the form still works before the page's JavaScript has loaded.

So a route handler is for what neither a server component nor an action can do:
anything a **third party** must reach — a provider posting to a URL, or a
buyer's browser that a provider has redirected back to us — and anything a
client component genuinely needs to fetch at runtime.

**Our payment provider posts nothing.** Hyp Pay at this tier has no callback at
all, so what applies is the second half of that first case: Hyp sends the
*buyer's browser* back to a URL of ours. That URL is a route handler rather
than a page for a reason which has nothing to do with payments — it has to
clear the cart cookie, and Next permits a cookie to be set only from an action
or a route handler, never while rendering a page. See "Money routes" below.

`/admin/api/translate` is the built example of that last case: the browser needs
an answer in the middle of a form, when a field is left, and the provider key may
not leave the server. It is a route because there is no page render to hang it
on — not because a route was the first thing to hand.

Its `kind` is worth copying the next time a route feeds a language model. The
browser has to say whether it is asking about a title or a description, because
they want different instructions — but what it sends is **one token from a
closed set, checked here against the exported constant**, never the instruction
itself. A body that carried the prompt would be an endpoint for saying anything
at all to a model, on our key.

The gallery, the homepage grid and the artwork page need **no** API. The admin's
save actions should be Server Actions. The payment provider's return must be a
route, for the cookie reason above.

**The cart added no endpoint either**, and it is the clearest example of the
rule so far because a cart is the shape of thing that usually gets one — and
because the cart is a **drawer**, which is exactly the case that normally
justifies a route handler. Four Server Actions in `lib/cart/actions.js` — read,
add, remove, sweep up what has vanished — and the drawer awaits what they
return. That is the sentence above made real: *a client component can call a
Server Action directly and await what it returns.* There is no `/api/cart`, and
there must not be one.

**They return the cart rather than redirecting**, which is the property to
copy. A panel that opens in place cannot navigate, so it needs the new contents
back — and the `/cart` page keeps working unchanged, because a form whose action
returns a value still re-renders the route it posted from. One set of actions,
two surfaces, no duplication.

`notice` comes back as a **code**, never a sentence, so the Hebrew stays in the
locale files and the component picks the wording — the same arrangement as the
admin's `?saved=`. A code the caller has no sentence for renders nothing.

**Image upload added no endpoint of ours at all**, and it is the case most
likely to be mistaken for one that needs a route. The instinct is an upload
endpoint the browser posts a file to — but a Server Action caps its request body
at 1MB, and raising that only moves a photograph the artist is uploading through
a function billed by the second. So the file goes **from the browser to the
image host directly**, and the two halves that must be ours are Server Actions:
one signs the upload, one records what arrived. Neither has a URL, both are POST
only, and each verifies the session itself.

The rule that generalises: **"the browser needs an answer mid-form" is not by
itself a reason for a route handler.** A client component can call a Server
Action directly and await what it returns, which is exactly what these two do.

That is worth stating because `/admin/api/translate` above reads as a precedent
for the opposite, and it is not one — it could have been an action on the same
grounds. It is a route, it works, and forward-only applies to habits as much as
to migrations: **do not copy it for the next thing the browser has to ask.**
Reach for a route when a *third party* must have a URL to call.

**Anything under the admin must live under `/admin`.** The session cookie is
scoped to that path, so a handler at `/api/admin/...` would never receive it and
would look unauthenticated no matter how correct its guard. See security.md.

## Conventions

- Handlers read painting data through `lib/data/works-repository.js`, never
  through storage directly.
- Responses are plain serializable JSON with a consistent success and error
  shape across every route. Pick one shape and keep it.
- Never trust an identity supplied in a request body. The admin's identity comes
  from its verified session cookie.
- Never trust a price, a status, or a total supplied by the client. The server
  computes what is charged from its own records.
- Validate input at the boundary. Reject unknown values against the exported
  constants rather than writing whatever arrived. The closed sets are wider than
  they were: the four sale statuses, the two categories, the two image types,
  the two medium keys, the six order statuses, the three sale channels, and the
  supported locales. Each is also constrained in the database, so an unvalidated
  write fails there — but as a constraint violation the user cannot act on,
  which is not an error message.
- An error returned to the browser says what the user can do about it; the
  detail goes to the server log.

## Public and admin routes

Anything under the admin is authenticated. There is no such thing as an admin
route that is merely "hard to guess" — apply the check in one place, and apply it
to every mutation, not only to the pages that render forms.

## Money routes

Checkout re-verifies each work's status server-side at the moment of payment, not
at the moment it entered the cart. See commerce.md — this is the rule that stops
the site selling a painting that no longer exists.

**That re-verification is one conditional write, and it is the whole of the race
protection.** A work moves to `sold` only by a statement that requires it to be
available in the same breath, and whether it matched is how we learn whether we
won. There is deliberately **no reservation held across a browser session** —
commerce.md records why a timer, an expiry and a sweep were rejected.

### Who may write payment state

**This rule was amended deliberately, and the version it replaces is worth
stating, because it is the one most codebases have.** It read: *payment webhooks
are the only writer of payment state; never set an order paid from a client
callback or a redirect.* That is the right rule when a provider offers a
webhook. **Hyp Pay at our tier offers neither a webhook nor a standalone
transaction-status query**, so the old rule was not merely strict — it was
unimplementable, and a rule that cannot be followed is worse than one that is
imperfect, because it gets quietly broken instead of deliberately changed.

What replaces it:

- **The only trusted writer of payment state is our own server, after it has
  validated the redirect with the provider's VERIFY call.** Not the browser, not
  the redirect, not a person reading a confirmation page.
- **Raw redirect parameters are never trusted.** They arrive in a URL the buyer
  can edit. They are evidence that a transaction *may* have happened, and an
  input to VERIFY — never an amount, a status or an identity.
- **An unverified or failed redirect changes nothing.** No order moves to
  `paid`, no work is marked sold, and the buyer is told something they can act
  on. Silence is the safe direction: an order left `pending` is recoverable, and
  an order wrongly marked `paid` is a painting given away.

### The branch with no signal, which cannot be closed

**A buyer who pays and then closes the window before the redirect is a real
branch, not an edge case.** Money has been taken, no redirect ever reaches us,
and with no webhook and no status query **nothing server-side can discover it.**

That is an accepted limitation of this tier rather than a bug to engineer
around, so it is written down rather than rediscovered:

- Those orders stay `pending`. Nothing invents a payment for them.
- They are reconciled **by a human, against the Hyp console** — the only place
  the transaction can be seen.
- **The admin orders list must surface them.** A pending order old enough to be
  suspicious is the only signal the artist gets, and it is the same shape of job
  as surfacing a dispatch that was never marked delivered.

### What VERIFY requires

Provider facts, from developers.hyp.co.il and confirmed in a call. Each is a way
to get this wrong that no test of ours would catch:

- **VERIFY takes every parameter from the redirect, in its original order.**
  Reordering or dropping one fails the check, so the handler passes the query
  through as it arrived rather than rebuilding it from named fields.
- **The response is judged by its `CCode` value, never by HTTP status.** A 200
  carrying a failure code is a failure.
- **An HTML response means a system error**, not a declined payment. It is the
  "we do not know" case, and it takes the `pending` branch above rather than
  being reported to the buyer as a refusal.
- **The success and failure return URLs are terminal-level settings**, configured
  once in the Hyp console rather than sent per transaction. Our handler's path is
  therefore fixed by configuration, not chosen per request.
- **Undoing a charge is two different calls**, and which applies is a question
  about the date: `CancelTrans` voids a transaction the same day, before
  settlement; `zikoyAPI` refunds one afterwards. Neither is built.
- **The payment-page signature must be ON in our terminal** — switched on **only
  after our verification code is built and tested.** Enabling it first makes
  every test transaction fail, with nothing to say why. That code now exists, so
  this is a task for the day the account does; deployment.md holds the list.

### What a verified success actually does

In one transaction, and in this order:

1. **Seize every painting conditionally** — one statement, `status = 'available'`
   and nothing else in the `where` clause, and the count of rows it changed is
   the answer to whether we won. **All or nothing**: fewer rows than lines rolls
   the whole thing back, because half an order is worse than none.
2. **Only then mark the order paid**, with `paid_at` and the provider's
   reference.
3. **Then invalidate the public pages**, through `revalidatePublicSite()`. This
   is the only writer of `status = 'sold'` outside the admin, and the homepage
   and the gallery are both cached — so without this the site goes on offering a
   painting for up to an hour after somebody bought it. Nobody can buy it twice,
   because the cart re-reads and checkout re-verifies; the cost is a buyer told
   no at the last step. **On the `paid` branch only**: `alreadyPaid` is a
   refreshed return that wrote nothing, and clearing on it would let a buyer
   reloading a confirmation page drop the cache for everyone.

**It does not reuse `markWorkSold`.** That one guards on the sale channel and not
on the status, so it re-marks a painting that is already sold — and on a replay
it returns false for a work already carrying `this-site`, which read as "did I
win" is a false negative that would refund somebody who owns the painting.

**Marking paid is idempotent.** The order row is locked and read first, so a
refreshed return sees `paid`, writes nothing, and reports it. That check must come
before the seizure: by then the paintings belong to this order, so the conditional
update would match nothing and fire the race branch against the winner.

### When the buyer paid and the painting had gone

The charge already happened, so the money goes back immediately if it can:
`CancelTrans` voids it the same day and the order becomes `cancelled` — keeping
`paid_at`, because money did move. If the void is impossible the order stays
`paid` and carries `refund_due_at`, which is migration 010's column and the
artist's cue to refund by hand. **The order records which of the two happened**,
and the cart is left alone, because nothing was sold to this buyer.

Amounts crossing this boundary are **minor units** — agorot — because that is
how they are stored and how a provider charges. Convert once, in the repository,
and never in a route handler; two conversion sites is how one of them gets
missed and a charge comes out a hundred times too large.

A checkout must also capture the **language the buyer was reading** and write it
to the order. It is required, it cannot be recovered afterwards, and the tax
invoice depends on it.
