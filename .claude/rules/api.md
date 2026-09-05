# API

Two routes exist. This file records the conventions to build to, and the table
below is filled in as more land — the previous project kept a full method / path
/ body / returns table per area, and this should end up the same.

## The routes there are

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/api/health` | — | `{ status, works, dataIsPlaceholder }` | Liveness, and proof the repository and the database are reachable from a handler |
| POST | `/admin/api/translate` | `{ text, kind }` — Hebrew, at most 5,000 characters, and `title` or `description` | `{ ok: true, text }`, or `{ ok: false, error }` | The admin work form filling an English field in from its Hebrew twin. Verifies the session itself and returns 401 without one. 400 empty, unparseable or an unknown kind, 413 too long, 429 the provider is rate limiting, 503 no key or a key it refuses, 502 anything else |

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
**webhooks** (a payment provider posts to a URL, and it cannot call an action),
anything a **third party** must reach, and anything a client component genuinely
needs to fetch at runtime.

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
save actions should be Server Actions. The payment webhook must be a route.

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

Payment webhooks are the only writer of payment state. Never set an order paid
from a client callback or a redirect — the user closing the tab must not change
the outcome.

Amounts crossing this boundary are **minor units** — agorot — because that is
how they are stored and how a provider charges. Convert once, in the repository,
and never in a route handler; two conversion sites is how one of them gets
missed and a charge comes out a hundred times too large.

A checkout must also capture the **language the buyer was reading** and write it
to the order. It is required, it cannot be recovered afterwards, and the tax
invoice depends on it.
