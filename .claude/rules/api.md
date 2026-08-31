# API

Nothing is built yet. This file records the conventions to build to, and must be
filled in with real routes as they land — the previous project kept a full method
/ path / body / returns table per area, and this should end up the same.

## Shape

API handlers live under `app/api/` in the same app as the pages. There is no
separate server process and no separate deployment.

**Prefer not to add an endpoint at all.** A server component reads through the
repository directly — no route, no fetch, no loading state. An API route is for
things a server component cannot do: mutations, form submissions, webhooks, and
anything a client component genuinely needs at runtime.

So: the gallery, the homepage grid and the artwork page need **no** API. The
admin's save actions, the cart, checkout, and the payment webhook do.

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
  the two medium keys, the five order statuses, the three sale channels, and the
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
