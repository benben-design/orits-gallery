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

Two rules about that field, and neither is in the schema:

- **The channel belongs to the sold status.** A sold work has somewhere it sold;
  an available one has no channel at all. The admin form asks the question only
  once "sold" is chosen, rather than standing it beside the status as an
  unrelated box. The database deliberately does **not** tie the two columns, so
  a work can still be edited in either order — this is the form guiding her, not
  a constraint.
- **`this-site` is written by checkout and never by hand.** It means money moved
  through this site, so it is a claim about an order that either exists or does
  not. The admin therefore offers only `under1000` and `elsewhere`, with
  under1000 first because that is the sale the site cannot see and the one she
  actually records. A work already carrying `this-site` keeps it: the form says
  where it came from and passes it through untouched rather than dropping it.

The four values are unchanged and deliberate. What has changed is that they are
now enforced by the database as well as by the application — adding a fifth is a
migration, not an edit.

## Status does not control visibility

**Publication is a separate axis.** A work carries a nullable publication
timestamp — `published_at` in the schema — and null means a **draft**: it exists
in the admin and the public site must not show it.

A draft may hold **any** of the four sale statuses. A work can be sold and
unpublished, or available and unpublished. So no sale status ever means "hidden",
and nothing may infer visibility from `status` alone. Any public read filters on
publication *and* presents status; the two questions are unrelated.

This is why publication is not a fifth status. Folding it in would make
"sold but not yet published" unexpressible, and that is a real state — the
artist photographs and drafts a work that has already gone at a fair.

### Publishing has one precondition: a photograph

**A work cannot be published without a main image**, and the admin refuses it
with a message that says why — on the site it would appear as an empty frame,
which is what a stranger would see before deciding whether to trust the shop.

This became a rule the moment uploading existed. Before that, a work with no
photograph was a state the admin *forced* on her and refusing it would only have
blocked work she had no other way to do; now it is a mistake, so it is refused.

**The rule is about the act of publishing, not about being published**, and that
distinction is the whole of it:

- Ticking publish on a work that is not yet public is refused when it has no
  image.
- Saving a work that is **already** public is never refused. A work published
  before this rule existed goes on being editable, on every field, forever.

That second half is not a loophole — it is the requirement. A rule written as
"a published work must have an image" would stop her fixing a typo on an old
record, on a field nobody touched. This project has already met that trap once,
in the 100cm size limit that had to be deferred for exactly the same reason: a
validation that arrives after the data does must apply to the transition, not to
the state.

The consequence, accepted knowingly: **the rule closes the door, it does not go
back through it.** Anything published imageless before it landed stays that way
until somebody attaches a photograph.

**A new work can be created already published**, as long as it arrives with a
photograph — the create form carries the image panel, so attaching one and
ticking publish is a single save. Without one it is refused exactly as on the
edit page, and the message says the work has not been saved at all, because it
has not: nothing is written when the refusal fires.

## A discount is a price, not a status

A work may carry an **optional reduced price** alongside its regular one. A
discounted work is **still `available`** — there is no discounted status, and
there must never be one.

The database enforces that a reduced price actually undercuts the regular price,
and that absent means absent rather than zero, because a zero would be a free
painting.

**How a reduced price is presented has not been decided.** The four-state table
below covers status only. Whatever is chosen, it must not be carried by colour
alone, for the same reason as everything else here.

That is no longer only a gap — it is now a **latent disagreement**, and it wants
settling before a work carries a discount rather than after. The cart's total is
computed from `chargeableAmount`, which takes the reduced price, because a total
must be what would actually be charged. `components/ui/Price.js` renders
`amount` and says nothing about a reduction. So the day a work is discounted,
its artwork page and its cart line will show one figure and the cart's total
another, and nothing will complain. No work carries a reduced price today, which
is the only reason this is dormant.

**Which status a discount does not change is settled**: a reduced work is still
`available`, so it is still buyable, and `isBuyable` never consults the price.

### The four presentations (decided)

Each state gets its own treatment, and **none of them is carried by colour
alone.** The palette has one accent and one secondary ink, so every distinction
lives in form — whether a badge is present, which badge it is, and what happens
to the price. That is what keeps status legible for a colour-blind buyer, and
in a screenshot.

| Status | Badge | Price |
|---|---|---|
| `available` | none | plain amount |
| `reserved` | badge on the clay tint | plain amount |
| `sold` | badge on the sold tokens | **struck through** |
| `not-for-sale` | none | **replaced by the words for it** |

- **Available needs no label.** It is the default, and a badge on every card is
  noise. The visible price is itself the signal that the work can be bought.
- **Reserved is the state a buyer acts on** — someone else is mid-purchase — so
  it must be unmistakable at a glance without being alarming. **It is a human
  state, and checkout never writes it:** the artist sets it when somebody tells
  her they are taking a painting. See the decision under the double-sale problem.
- **Sold keeps its price, struck.** The work stays on display: it is part of the
  body of work and evidence of demand, not something to hide. The strike is also
  what separates sold from reserved without relying on the badge's hue.
- **Not-for-sale is the absence of a transaction, not a stage of one**, so it
  does not borrow the visual language of the other three. No badge; the price is
  replaced.

The table lives in code at `components/ui/statusPresentation.js`, read by
`StatusBadge`, `Price` **and the cart** so the halves of a state cannot drift
apart. Add a status there and in both locale files, never in a component.

It carries a fourth column that is not about looks: **`buyable`, and exactly one
status has it.** `reserved` deliberately does not — it means someone else is
mid-purchase, and letting a second buyer queue behind them is a second front
door onto the double-sale problem. An unrecognised status is **not** buyable,
which is the safe direction: a state nobody has thought about yet must not be
purchasable by default. Adding a fifth status is therefore a decision about
whether it can be bought, taken in the same place as the decision about how it
looks.

## The double-sale problem

Because the artist also sells on under1000, a painting can be sold out from under
the site without the site knowing. This is the most damaging failure mode in the
product: taking money for something that no longer exists.

Mitigations, all required:

1. **Checkout re-verifies status server-side at the moment of payment**, not when
   the item was added to the cart. A cart is a wish, not a hold.
   **Built.** It is *one conditional write* at the moment a payment is verified:
   the statement that marks a work sold requires it to still be available, so
   winning and losing the race are the same query and there is no check-then-act
   window between them. The row count is the answer, and it is all-or-nothing
   across the whole cart.
   **There is deliberately no reservation during checkout** — a settled decision
   rather than a gap, recorded below.
   **And the losing side is built too, because by then the money has moved.** The
   charge is voided the same day if it can be, and flagged `refund_due_at` if it
   cannot; the buyer is told the painting sold moments ago and what happens to
   their money. See api.md, and deployment.md for what that path cannot prove
   until there is a Hyp account.
2. **A cart may hold a work, but must never be trusted as a reservation.** If a
   work's status changed while it sat in a cart, the user is told clearly before
   any money moves.
   **Built, and built structurally rather than by discipline.** The cart cookie
   holds work ids and nothing else — no title, no price, no status — so there is
   no stale copy of anything to trust. Both surfaces that draw a cart, the
   drawer and `/[locale]/cart`, re-read every work through the public-scoped
   `getWorksByIds` each time; a work that is no longer buyable keeps its line,
   says so in a sentence, and is left out of the total. One that has been
   unpublished or deleted stops resolving entirely and is reported as a count
   with a control that clears it.
   The same check runs again when anything is added, so a painting that sold
   between the page rendering and the button being pressed is refused with a
   message rather than added.
   Note what this does **not** do: it changes nothing about a work that sold on
   under1000 and was never marked sold here. The site can only re-verify what it
   has been told, which is why item 3 matters more than it looks.
3. **Marking a work sold is the single most prominent action in the admin.** One
   click from the works list, with no need to open an edit screen. If the artist
   has to hunt for it, she will not do it, and the site will sell air.
   **Built.** Every row on the works list links to `/admin/works/[id]/sale`,
   which asks where it sold and marks it in one gesture — two buttons, one per
   channel, and pressing one *is* the answer. Its own Server Action with its own
   session check, per security.md.
   **The reason it is not a control on the row itself** is that a page can name
   the painting before anything changes. Marking the wrong row sold pulls a live
   painting off sale and nothing announces it; on a phone at a fair, adjacent
   rows are one mis-tap apart. It is reversible, unlike deleting, which is why
   one link and one button is the whole ceremony.
   **What makes this worth more than the clicks it saves** is that it does not
   go through the edit form. That form refuses to save while any machine
   translation is unapproved — so before this existed, a painting sold at a fair
   could fail to be marked sold because an English description generated a
   fortnight ago had never been read. A one-field change about money, blocked by
   a field she never touched, at the moment the site is still offering a
   painting that is gone. The action parses no form and validates no record:
   two columns move.

### The way back is the same shape as the way in

A hand-marked sale can be marked wrongly, and a mistake that is harder to undo
than it was to make is a mistake that stays. So the same page returns a sold
work to sale, and the same row links to it.

- **Returning a work to sale clears the channel, in the same statement.** A work
  that is `available` while still recording where it sold is a contradiction the
  schema permits, nothing complains about, and everything later reads as true.
  Status and channel are one fact and they move together in both directions.
- **It returns the work to `available`**, not to whatever it held before. The
  previous status is not recorded anywhere, and guessing `reserved` or
  `not-for-sale` back would be a guess about the field that decides whether a
  stranger can buy the painting.
- **A sale through this site is refused, not confirmed harder.** `this-site`
  means an order exists, so returning such a work to sale asserts that money
  went back — a claim about an order rather than a correction of a click. A
  heavier confirmation would still let her do it from a list of paintings, and
  nothing which later happens to the catalogue may change what an order says.
  The row still links to the page, and the page says why rather than the control
  quietly being absent.
- **The refusal is a `where` clause, not a read-then-decide.** Both writes
  exclude `sale_channel is distinct from 'this-site'` in SQL, so there is no
  window between checking and writing — the same reasoning that has `deleteWork`
  catch the foreign-key violation instead of counting order lines first.
4. **A record created automatically is never publicly visible.** Any future
   import or folder-watching automation creates a **draft**. The schema makes
   this the default rather than a discipline: `published_at` has no default, so
   a row inserted without one is a draft whether or not the importer remembered.

### No reservation during checkout (decided)

**Checkout never writes `reserved`.** That status stays exactly what it is
today: a human state, set by the artist when somebody tells her they are taking
a work.

Holding a painting the moment a buyer reaches the payment page was considered
and rejected. It would close the race properly — but it needs a timer, an
expiry and a sweep to release the holds nobody completed, and that is **three
new failure modes, every one of which can strand a live painting off sale with
nothing announcing it**, bought to defend against a race that happens at one or
two sales a month.

So the race is closed at the other end instead: **one conditional write at the
moment of payment**, which either matches an available work or does not. A
second buyer who somehow pays for the same painting is a refund and an
apology — rare, visible, recoverable. A stuck reservation is none of those: it
is invisible, and it costs sales until somebody happens to notice.

`reserved` remains not buyable, which is unchanged and still right. If the
artist has promised a painting to somebody, the site must not sell it to
somebody else.

## Automation, when it comes

The intended shape is: a file lands in a folder → a **draft** appears in the
artist's admin with the image attached and the fields empty → she fills in the
details and publishes.

Never folder-to-live. A folder is a messy place — duplicates, work-in-progress
shots, wrong crops, screenshots — and publishing straight from one to a public
shop will eventually publish something wrong. The automation feeds her inbox,
not the website.

## The three checkout controls are real now

**They were inert for months and they are not any more.** The drawer's checkout
button, `/cart`'s, and "buy now" on the artwork page are all ordinary links into
`/[locale]/checkout`. The `aria-disabled` attributes and the shared
`cart.checkoutPending` sentence — "buying through the site is not open yet" —
went with them, and that locale key is deleted rather than left unused.

They look exactly as they did, because they always looked the way they would
when they worked. What follows is the record of why they were inert and how the
colour was settled, which still governs what the artwork page's two controls
look like today.

**"Buy now" carries one painting, not the cart.** It links to
`/checkout?work=<id>`, and the checkout reads that single id from the URL and
never looks at the cart — so buying the painting in front of you neither adds to
nor disturbs whatever somebody had already put aside. A plain link rather than a
second cookie: nothing to expire, nothing to reconcile, shareable, and it
survives the back button.

**Payment being unconfigured is not an inert button.** With no `HYP_*`
credentials the checkout page shows the paintings and a sentence saying buying
is not open, and simply does not render the form — the same arrangement the
admin's work form makes when the image host has no keys. An absent feature is
honest; a control that dies under a finger is not.

**Its colour was settled by measurement**, and the number that settled it is
how loud each fill is against the wall rather than how legible its label is:
the accent fill is 5.43:1 on `--surface-wall`, a dark ink fill is 12.01:1, and
`--accent-hover` is 7.05:1. The reference store draws both of its buttons
near-black, and copying that would have put a 12:1 control directly beneath a
5.43:1 one — **the inert button would have been more than twice as loud as the
working one.** It briefly did carry the same accent fill, which had the same
fault for the same reason.

So it is `--surface-tint` with a `--line-strong` hairline and `--text-primary`
on it: quiet ground, defined edge, 10.80:1 on the label. The clay is the one
non-neutral surface in the palette and comes from the same terracotta family as
the accent, so the two controls read as a deep-and-pale pair. **The
one-filled-accent rule therefore still holds** — the accent belongs to the
control that works, and this one is visibly the second option rather than a twin
of the first.

**One overlap to know about:** `--surface-tint` and `--status-sold-bg` are the
same value, so the clay also means "sold" on a badge. They never meet on this
page, because a sold work is not buyable and draws no buy controls at all — but
one colour is doing two jobs, and a surface that ever shows a badge beside a
button will have to answer for it.

The inert version was reversed on purpose so the purchase flow could be shown end
to end before a provider was chosen, and it was held honest three ways while it
lasted: a `<button>` with no handler rather than a link to a stub page, an
`aria-disabled` so no screen reader was told it led anywhere, and a line beneath
saying buying was not open. **All three conditions are now satisfied by the
control simply being real**, which is what that section always said had to
happen before launch.

## What checkout does, in order

The sequence is the design, and it is the order api.md requires:

1. **Validate what was typed** — `lib/checkout/checkout-input.js`, pure, returning
   error codes rather than sentences.
2. **Re-verify every painting and write a `pending` order in one transaction**,
   with the works locked `for update` so two simultaneous checkouts for one
   painting queue instead of both being told yes.
3. **Only then ask Hyp to sign a payment page.**
4. **Redirect the buyer to it.**

**The order exists before the buyer reaches the payment page**, and that ordering
is not negotiable on this provider: there is no webhook and no status query, so a
payment that came back referring to no order would be unrecoverable.

**Nothing is reserved and nothing is marked sold at this point.** A pending order
is a record that somebody tried; the paintings stay `available` and stay buyable
by anyone else until a verified payment says otherwise. That is the no-reservation
decision above, made concrete.

**A painting that has gone stops the checkout and is named.** Not counted, not
"something in your order" — the title, because at the moment of paying somebody
should not have to compare four paintings against the gallery to find out which
one they have lost. The page refuses to offer the form at all while the cart
holds one, and the transaction refuses again on submit, because a painting can
sell between the two.

**The cart is not cleared by starting a checkout.** Nothing has been paid for. A
buyer who abandons the payment page comes back to the paintings they had chosen.

## Israeli consumer law

The site sells to Israeli consumers, so these are legal requirements, not nice
touches:

- **14-day cancellation** (חוק הגנת הצרכן). Stated plainly, not buried.
- **Terms** (תקנון), **shipping and cancellation policy**, and **privacy policy**
  as real pages, linked from the footer.
- **An accessibility statement** (הצהרת נגישות), and the site must actually be
  accessible — this is enforced in Israel for commercial sites.
- A **tax invoice** (חשבונית מס) per order. **Issued by the artist herself, by
  hand — and that is the decision for v1**, not a gap. At one or two sales a
  month the volume does not justify automating it, and Hyp Pay does not issue
  one for us. So nothing in this codebase generates, numbers or sends an
  invoice.
  What the site owes that task is the information it needs: the order, its
  total, and **the language the buyer was reading**, which is why `buyer_locale`
  is required and captured during checkout rather than inferred later.
  Automating it later is an integration with an invoicing service; it is not a
  change to the payment flow.

## Trust

A stranger is being asked for ₪2,000 by a site they have never heard of. The
promises row on the homepage — original one-off work, signed by the artist,
insured shipping in Israel, 14-day cancellation — is a conversion mechanism, not
decoration. Treat pricing, availability and policy visibility as product surface.

## Orders

An order is a historical record. It says what was true when money moved, and
nothing that later happens to the catalogue may change what it says.

- **An order line has no quantity, and adding one would be a bug.** Every
  painting is a one-off; "2 x Lemons" is not a thing that can be sold. One line
  is one work.
- **The same work cannot appear twice in one order.** The database refuses it —
  with no quantity column, that is also the only way the bug could express
  itself.
- **A work that has been ordered cannot be deleted.** The database refuses,
  rather than shrinking a paid order or leaving a line that has forgotten which
  painting was sold. A sold painting therefore stays in the catalogue
  permanently, which is the right answer anyway: if the artist wants it out of
  sight, that is unpublishing it, not deleting it. **The admin explains this in
  plain Hebrew** — a raw database error reaching the artist is a phone call to
  her son — and it does so by catching the constraint rather than by checking
  first, so the rule has one home. Built, and exercised against a real order
  line before any order flow exists.
- **The price on a line is copied at the moment of purchase**, never read back
  off the work. Prices change, and a discounted sale was charged at the reduced
  price; neither may retroactively rewrite what a buyer paid.
- **An order records the language the buyer was reading.** Required, not
  inferred. The confirmation and the tax invoice have to arrive in that
  language, and it cannot be reconstructed afterwards — it is not the site
  default, and an Israeli address says nothing about which language someone
  reads.

### The order statuses, and the date each one happened

`pending` · `paid` · `shipped` · `delivered` · `cancelled` · `refunded`

**`delivered` exists because the 14-day window runs from receipt.** This was
the schema gap 003 left and migration 007 closed: with only creation and
last-update timestamps, the moment an order moved from paid to shipped its
payment date was gone, and the statutory window could not be computed or
reconstructed. Dispatch is not receipt — counting from `shipped_at` closes the
window *earlier* than the law does, which is the direction that shortens the
buyer's rights.

It earns its place twice over. **"Which orders are still on the way" only has
an answer if there is a state after shipped**; with `shipped` terminal, an
order posted in March is still on the way in September and the list stops being
read. The cost is one click when a buyer says it arrived — which is the click
that starts a clock the business is bound by.

**Every status carries the date it happened, and the database enforces it
forwards.** A status at or past paid must carry `paid_at`, *including
`refunded`*, because a refund does not erase the payment before it. `shipped`
must carry `shipped_at`, and so must `delivered` **when the order is being
shipped** — a self-pickup order never ships and is excused, see Delivery below;
delivered must carry `delivered_at` either way; pending must carry none of them.
The dates must be in order, and since migration 009 that includes
`paid_at <= delivered_at` stated directly, because a pickup order has no
`shipped_at` for the chain to run through.

**Two exits are deliberately unconstrained**, and the reasoning is worth
copying: a `cancelled` order may or may not carry `paid_at`, because the
payment provider documents authorization separately from capture and an
authorised-then-voided order is real; a `refunded` order may or may not carry
dispatch and receipt, because refunding before dispatch and after delivery are
both legitimate. **Enforce what is unrecoverable if lost, stay silent where the
provider may legitimately be right.**

**We charge directly, and that is decided.** Hyp Pay's J2 — one step, the money
taken as the buyer confirms — rather than J5 authorize followed by J4 capture.
We are building against default terminal settings without a technical call, and
J2 is what those settings do. Authorize-then-capture stays available as a future
improvement if the double-sale race ever proves to be a real problem rather than
a theoretical one, because it is the shape in which a painting could be
confirmed still available *before* the money is taken. The silence above is what
leaves room for it.

Note this is the opposite call from `works.sale_channel`, which is
deliberately *not* tied to `status = 'sold'` — and the difference is the point,
not an inconsistency. That one is typed by hand into a form filled in any
order, and is recoverable by typing it again. These are written by a verified
payment return or one deliberate click, and a lost payment date is gone for good.

**Still open, and it is an admin task rather than a schema one: an order whose
receipt is never marked has no computable window.** It sits at `shipped` with
`delivered_at` null, indistinguishable from a parcel still in transit. No
constraint can make somebody confirm a delivery, and a default date would be
invented and then counted from. The orders list has to surface dispatches that
were never closed.

**The orders list is built and surfaces all three of its reconciliation jobs**:
orders pending for over an hour — the buyer who paid and closed the window —
orders carrying an owed refund, and **a dispatch nobody has confirmed as
received**, which is this paragraph's requirement.

That third one carries a **seven-day threshold** rather than firing the moment a
painting is posted, and the reasoning is the same one that put `delivered` in the
schema at all. The window is uncomputable from dispatch onwards, so on strict
reading every posted order qualifies — but a block listing every parcel sent this
morning is a block she stops reading, which is exactly how "which orders are
still on the way" stopped being answerable in the first place. Seven days is
comfortably longer than insured domestic delivery here, so anything still open
after it is either lost or simply unmarked. Both want a person, which is the
whole point. The interval is a named constant in `lib/data/orders-repository.js`.

### What cancelling or refunding does to the paintings

**They go back to draft, not back on sale**, and the sale channel is cleared in
the same statement. That is deliberate: a refund should not silently re-list a
painting on the public site the moment the money is returned. The artist may want
to re-photograph it, re-price it, or keep it — so publication is hers to restore,
from the painting itself.

**An order that owes a refund releases nothing.** Its painting was won by
somebody else in the race; taking it back to fix a refund would take it from a
buyer who is waiting for it. That order gets one action — recording that the
money was returned — and says so on the page.

Nothing writes orders yet. The cart holds work ids in a cookie and ends in a
deliberately inert checkout button. **The provider is settled — Hyp Pay, on the
yaad-sarig platform** — and what remains is the checkout itself, the verified
return that is this tier's only completion signal, and the admin's orders pages.

## Delivery

**Two ways a painting reaches its buyer, and they are not the same
transaction.**

| Method | Cost | Address | How it completes |
|---|---|---|---|
| `shipping` | **40 ILS flat**, anywhere in Israel | required | `paid` → `shipped` → `delivered` |
| `self-pickup` | **free** | **none at all** | `paid` → `delivered`, in one act |

**Flat anywhere in Israel, deliberately.** A zone table is a pricing model to
maintain for a country four hours long, and it would be the artist keeping it
current.

**The fee charged is stored on the order and never recomputed.** The rate lives
in exactly one place in code — `lib/delivery.js` — and it is expected to move to
`/admin/settings`. The day it changes, anything that recalculated an old order's
delivery cost from the current rate would rewrite what that buyer was charged,
silently, in a record that has to read the same in three years in front of an
accountant. That is the rule `order_lines.price_agorot` already follows for the
paintings, applied to the other line on the invoice. Do not scatter the rate, and
do not derive an old order's delivery cost from it.

**A pickup order has no address** — not an empty one, and not the studio's own
address typed into the buyer's field, which is what a required column invites.
The database enforces both halves: required for shipping, absent for pickup.

**A pickup order never ships, and that is why migration 009 had to correct 007.**
The artist hands the painting over, and that single act is both dispatch and
receipt. Forcing a `shipped_at` would mean inventing a date nobody observed, on
the columns 007 exists to keep honest — so a pickup order may carry neither the
`shipped` status nor a dispatch date, and goes straight to `delivered`.

The legal point survives intact, which is the test that mattered: **the 14-day
window counts from receipt**, and a pickup order has a real `delivered_at` — the
moment she handed it over. For the artist that is one click at the moment of
handover, and it is the click that starts a clock she is bound by.

**Pickup is free and the database enforces it; the shipping fee is deliberately
not pinned to 40 ILS.** Pinning it would put today's price list in the schema,
make a rate change a migration, fail an old order's own constraint the day the
rate moved, and refuse a free-shipping promotion. Same line as everywhere else
here: enforce what is never legitimately otherwise, stay silent where the
business may reasonably change its mind.

## Money handling

Prices are stored as an amount plus a currency, never as a formatted string, and
never as a float that gets rounded at display time in different places.

**In the database that amount is a whole number of minor units — agorot.** The
local data file still holds whole shekels, so a conversion is required between
them, and it belongs in the repository in exactly one place. A silent mismatch
renders a price a hundred times too large and neither layer complains. See
data-layer.md.

The client never determines what is charged. The server computes the price from
its own records at payment time.
