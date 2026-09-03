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
  it must be unmistakable at a glance without being alarming.
- **Sold keeps its price, struck.** The work stays on display: it is part of the
  body of work and evidence of demand, not something to hide. The strike is also
  what separates sold from reserved without relying on the badge's hue.
- **Not-for-sale is the absence of a transaction, not a stage of one**, so it
  does not borrow the visual language of the other three. No badge; the price is
  replaced.

The table lives in code at `components/ui/statusPresentation.js`, read by both
`StatusBadge` and `Price` so the two halves of a state cannot drift apart. Add a
status there and in both locale files, never in a component.

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
   **Not built.** The works list exists now and shows the status of every work,
   but changing one still means opening the edit form and saving it. That is
   the next thing to build here, and it needs its own Server Action with its own
   session check — see security.md.
4. **A record created automatically is never publicly visible.** Any future
   import or folder-watching automation creates a **draft**. The schema makes
   this the default rather than a discipline: `published_at` has no default, so
   a row inserted without one is a draft whether or not the importer remembered.

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

Known gap, and it matters legally: **the 14-day cancellation window cannot be
computed from the schema as it stands.** Only creation and last-update
timestamps exist, so once an order moves from paid to shipped the payment date
is gone. Israeli law counts the window from receipt. This needs dated status
transitions before checkout is built.

Nothing writes orders yet — no cart, no checkout, no payment provider.

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
