# API

Two routes exist. This file records the conventions to build to, and the table
below is filled in as more land — the previous project kept a full method / path
/ body / returns table per area, and this should end up the same.

## The routes there are

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/api/health` | — | `{ ok: true }`, always `no-store` | Liveness only. **Touches no database**: a public route that queried Postgres on every request was a way for anybody to wake the production database. Nothing in the repository monitors it |
| POST | `/admin/api/translate` | `{ text, kind }` — Hebrew, at most 5,000 characters, and `title`, `description` or `about` | `{ ok: true, text }`, or `{ ok: false, error }` | The admin work form filling an English field in from its Hebrew twin. Verifies the session itself and returns 401 without one. 400 empty, unparseable or an unknown kind, 413 too long, 429 the provider is rate limiting, 503 no key or a key it refuses, 502 anything else |
| GET | `/api/payments/hyp/return` | — (Hyp's query string) | 307 to `/[locale]/order/[id]`, always `Cache-Control: no-store` | The terminal's **success** return. Refuses a query carrying one of our keys or any key twice, or whose `Order` is not in the shape of one of our ids, before reading anything; then counts the source against a limit of 30 an hour (migration 014); then calls VERIFY, and changes nothing before it answers; on a verified redirect whose `CCode` is `0` and whose `Order` and `Amount` match, it seizes the paintings and marks the order paid in one transaction, then clears the cart. A verified charge that does not match is voided. A route rather than a page for the cookie reason — only an action or a handler may set one |
| GET | `/api/payments/hyp/error` | — (Hyp's query string) | 307 to `/[locale]/order/[id]`, always `Cache-Control: no-store` | The terminal's **error** return, and it runs **the same handler**. Which URL the browser lands on is the provider's opinion; the signed redirect's `CCode` is the fact. A signed decline here changes nothing — but a landing here that verifies as a genuine, matching charge is settled, because the alternative is keeping money on the strength of a redirect path |

Health moved onto the envelope on 29-09-2026; **`{ ok }` is the shape every
route shares**, with `error` a *code* rather than a sentence,
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
- **Before VERIFY answers, the redirect's parameters are nothing. After it,
  they are Hyp's signed statement.** *(Amended 28-09-2026; it used to read
  "raw redirect parameters are never trusted".)* They arrive in a URL the buyer
  can edit, so until VERIFY has confirmed Hyp's signature over them they are an
  input to VERIFY and nothing else — never an amount, a status or an identity,
  and read before it for one thing only: which language to answer in. **Once
  VERIFY has confirmed the signature, the redirect is the only statement of the
  payment there is**, because VERIFY itself answers `CCode` and nothing more: it
  says the signature is genuine, not that a payment succeeded, and it names no
  transaction. So after verification the redirect's `CCode` is read to learn
  whether a charge happened, its `Order` and `Amount` to learn whether it was
  the charge we asked for, and its `Id` to name it.
- **A return that repeats a key, or carries one of ours, is refused before
  VERIFY is asked.** `action`, `What`, `Masof`, `KEY` and `PassP` in any letter
  case, any key twice, an empty query, a key that is not a plain name, or a `;`
  anywhere — raw, or inside a decoded value, since some stacks split on it and
  Next hands a raw one over as `%3B`. Our
  five are sent in front of the redirect and Hyp most likely keeps the last
  value of a repeated key, so a return carrying one would change the question
  Hyp is asked. It is a gate, not a rewrite: the query is still never parsed
  and rebuilt on its way to VERIFY.
- **A return whose `Order` cannot be one of ours is refused before the
  database is read or VERIFY is asked** (30-09-2026), and so is a source past
  30 returns in an hour. Both routes are public, and each request used to cost
  a read and a VERIFY call made with the terminal's credentials, for anybody.
  **What that gives up, knowingly:** a genuine charge whose `Order` a buyer
  edited into something that is not one of our ids is no longer voided
  automatically — it is refused unverified and logged under
  `REFUSED_UNVERIFIED`, and reconciled by hand against the Hyp console like a
  closed window. That edit is possible only while payment-page signing is off,
  which deployment.md's checklist turns on before launch. A buyer whose
  redirect names one of our orders is always sent to that order's page.
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
  through as it received it rather than rebuilding it from named fields.
  **"As it received it" is not "as Hyp sent it"**, measured on 28-09-2026: Next
  re-encodes a request's query before any route handler runs, so `%20` becomes
  `+` and `~!()` are percent-encoded. Keys, order and decoded values survive.
  Whether Hyp accepts that is unproven — see deployment.md.
- **The response is judged by its `CCode` value, never by HTTP status.** A 200
  carrying a failure code is a failure.
- **A VERIFY answer is `CCode=0` and nothing else** — no transaction id, no
  amount. It counts as success only in that shape: exactly one `CCode`, exactly
  `'0'`, and none of the keys a SIGN answer carries (`signature`, `action`,
  `Masof`). A success of the wrong kind is not a success. The stand-in this
  was first tested against answered with more than `CCode`, which is how an
  earlier version came to read the transaction id from the answer and would
  have recorded none against a real terminal.
- **An HTML response means a system error**, not a declined payment. It is the
  "we do not know" case, and it takes the `pending` branch above rather than
  being reported to the buyer as a refusal.
- **The success and failure return URLs are terminal-level settings**, configured
  once in the Hyp console rather than sent per transaction. Our handler's path is
  therefore fixed by configuration, not chosen per request.
- **Undoing a charge is two different calls**, and which applies is a question
  about the date: `CancelTrans` voids a transaction the same day, before
  settlement (until 22:00 Israel time); `zikoyAPI` refunds one afterwards.
  `CancelTrans` is built, sent as documented — `action`, `Masof`, `PassP` and
  `TransId`, which is the redirect's `Id`, and no `KEY` — and answers
  `CCode=0&ReversalStatus=777`, or `CCode=920` when it is too late. `zikoyAPI`
  is not built.
- **Hyp recommends configuring no error URL at all**, leaving declines on its
  own payment page. Both of ours run the same handler, so either choice is safe
  here; what the recommendation adds is that with an error URL set, anything
  that is not a standard immediate charge (codes 700 and 800) lands on it.
- **The payment-page signature must be ON in our terminal** — switched on **only
  after our verification code is built and tested.** Enabling it first makes
  every test transaction fail, with nothing to say why. That code now exists, so
  this is a task for the day the account does; deployment.md holds the list.

### What a verified return is allowed to settle

VERIFY says the redirect is genuine. What the redirect then says decides
everything, in this order:

- **Its `CCode` is not exactly `'0'`: nothing changes**, exactly as for a failed
  verification. A decline signed by Hyp is authentic and is still not a charge.
- **`CCode` is `'0'`, `Order` is this order's id and `Amount` is its total: it
  is settled.** `Amount` is parsed strictly as shekels with at most two
  decimals — `1040`, `1040.5`, `1040.50` — and converted to agorot as text,
  never through a float, by `parseAmountParameter` beside the function that
  wrote it. Compared with the order's `total_agorot`, which is what we asked
  Hyp to charge.
- **`CCode` is `'0'` and either does not match: money moved for something we
  did not sell.** It takes the lost-race path below — voided, or recorded as a
  refund owed — and **the paintings are never seized**. Both amounts are logged
  at full volume. A buyer who edits `Amount` on a payment page (possible
  whenever payment-page signing is off on the terminal) gets a genuinely signed
  return for the smaller amount, and this is the branch that stops it
  settling. A verified charge naming no order we have — in the shape of one of our ids — is voided the same way,
  and with no row to record it against, the log line is the whole record.
- **The transaction's name is the redirect's `Id`** — `payment_reference`, and
  `TransId` for a void. **A matching success with no `Id` is still settled**:
  Hyp signed a charge for this order at its total, so the buyer really paid,
  and leaving it pending would keep the painting on sale to somebody else and
  tell the payer it failed. It is written with a null reference, logged at full
  volume, and the admin order page says the reference is missing so she can
  match it against the Hyp console. A refresh is still caught, by the order's
  status.
- **Every response on both routes carries `Cache-Control: no-store`**,
  whatever the outcome, including an exception nobody anticipated. Nothing on
  the money path depends on a platform's default.

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

**A second genuine charge against an order already settled is voided, and the
order is left alone.** Same order, same total, a different `Id` from the one the
order records — a buyer who paid twice, or paid for an order since cancelled.
The first payment bought the painting, so no `refund_due_at` is set: the order
page would then tell a buyer who owns it that it is unavailable. An `Id` equal
to the stored reference is a refresh and does nothing. If the void fails, the
log line is the whole record, under the phrase deployment.md's checklist names.

**The same path takes a verified charge that does not match its order.** Either
way the transaction's `Id` is written to the order, which is how a refresh of
that return is recognised and not voided a second time. Only a **pending**
order can carry the outcome; a stray charge against an order already settled,
or against none, is logged at full volume and reconciled by hand.

Amounts crossing this boundary are **minor units** — agorot — because that is
how they are stored and how a provider charges. Convert once, in the repository,
and never in a route handler; two conversion sites is how one of them gets
missed and a charge comes out a hundred times too large. **The one exception is
the provider's own decimal `Amount`**, which `lib/payments/hyp.js` writes
(`toAmountParameter`) and reads back (`parseAmountParameter`) as a pair, side
by side, with integer arithmetic both ways — proven to round-trip over two
thousand amounts.

A checkout must also capture the **language the buyer was reading** and write it
to the order. It is required, it cannot be recovered afterwards, and the tax
invoice depends on it.
