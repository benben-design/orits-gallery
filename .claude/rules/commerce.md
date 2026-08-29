# Commerce

## Every painting is a one-off

There is no stock of two. Nothing in this system may treat a work as a quantity.
No quantity selector, no "3 left", no restock. One record, one object, one buyer.

That single fact is behind every rule below.

## Status is a field, not a boolean

`available` · `reserved` · `sold` · `not-for-sale`

A boolean `is_sold` cannot express a work that is on hold for a buyer who is
still deciding, a work the artist is keeping, or a work that sold somewhere else.
Never add one, and never reduce the status to a boolean at the UI layer either —
each state needs its own presentation.

Alongside it, a work records **which channel it sold through** — this site,
under1000, or elsewhere. The artist sells in parallel on other platforms, so the
site is not the only thing that can consume a painting.

## The double-sale problem

Because the artist also sells on under1000, a painting can be sold out from under
the site without the site knowing. This is the most damaging failure mode in the
product: taking money for something that no longer exists.

Mitigations, all required:

1. **Checkout re-verifies status server-side at the moment of payment**, not when
   the item was added to the cart. A cart is a wish, not a hold.
2. **A cart may hold a work, but must never be trusted as a reservation.** If a
   work's status changed while it sat in a cart, the user is told clearly before
   any money moves.
3. **Marking a work sold is the single most prominent action in the admin.** One
   click from the works list, with no need to open an edit screen. If the artist
   has to hunt for it, she will not do it, and the site will sell air.
4. **A record created automatically never defaults to available.** Any future
   import or folder-watching automation creates a **draft**, not a live listing.

## Automation, when it comes

The intended shape is: a file lands in a folder → a **draft** appears in the
artist's admin with the image attached and the fields empty → she fills in the
details and publishes.

Never folder-to-live. A folder is a messy place — duplicates, work-in-progress
shots, wrong crops, screenshots — and publishing straight from one to a public
shop will eventually publish something wrong. The automation feeds her inbox,
not the website.

## Israeli consumer law

The site sells to Israeli consumers, so these are legal requirements, not nice
touches:

- **14-day cancellation** (חוק הגנת הצרכן). Stated plainly, not buried.
- **Terms** (תקנון), **shipping and cancellation policy**, and **privacy policy**
  as real pages, linked from the footer.
- **An accessibility statement** (הצהרת נגישות), and the site must actually be
  accessible — this is enforced in Israel for commercial sites.
- If an Israeli payment provider is chosen, a **tax invoice** (חשבונית מס) is
  issued per order. That is a factor in choosing the provider.

## Trust

A stranger is being asked for ₪2,000 by a site they have never heard of. The
promises row on the homepage — original one-off work, signed by the artist,
insured shipping in Israel, 14-day cancellation — is a conversion mechanism, not
decoration. Treat pricing, availability and policy visibility as product surface.

## Money handling

Prices are stored as an amount plus a currency, never as a formatted string, and
never as a float that gets rounded at display time in different places.

The client never determines what is charged. The server computes the price from
its own records at payment time.
