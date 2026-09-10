import Link from 'next/link';
import { notFound } from 'next/navigation';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { formatPrice, formatDateTime } from '@/lib/format';
import { getOrderForAdmin } from '@/lib/data/orders-repository';
import {
  advanceOrderStatus,
  cancelOrder,
  refundOrder,
  settleOwedRefund,
} from '@/app/(admin)/admin/actions';
import styles from './page.module.css';

/**
 * /admin/orders/[id] — one order, and the buttons that move it.
 *
 * **Every action here is a form post with its arguments bound server-side**, and
 * every one of them re-checks the session in its own first line. The guard on
 * this page protects the rendering and nothing else — a Server Action is a POST
 * endpoint Next reaches directly. See security.md.
 *
 * **The buttons offered are only the transitions the schema permits**, and the
 * repository's `where` clauses check the same thing again. That belt-and-braces
 * is the point: a stale tab, a double press or a hand-made POST matches nothing
 * and changes nothing, rather than raising a constraint violation at the artist.
 *
 * Two shapes of order behave differently, and the wording follows:
 *
 * - A **shipping** order goes paid → posted → received.
 * - A **pickup** order goes paid → received in one step, because there is no
 *   dispatch. The button says *handed over* rather than *sent*, which is what
 *   actually happened, and migration 009 is what makes that path legal.
 *
 * And an order carrying an **owed refund** is not a sale at all: the buyer paid
 * for a painting that had already gone to somebody else. It gets one action —
 * recording that the money went back — and it is deliberately not offered the
 * dispatch buttons, because there is nothing to dispatch.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);

  /*
    A fixed string. Never the buyer's name or the painting: `generateMetadata`
    runs even when the guard redirects, so a title built from the record would
    describe somebody's order to a request with no session. See security.md.
  */
  return { title: dictionary.admin.order.title };
}

export default async function AdminOrderPage({ params, searchParams }) {
  const { id } = await params;
  await requireAdminSession('/admin/orders/' + encodeURIComponent(id));

  const dictionary = await getDictionary(adminLocale);
  const copy = dictionary.admin.order;

  /* The lookup runs after the guard, so an unauthenticated request never
     reaches the database and cannot tell a real order from a missing one. */
  const order = await getOrderForAdmin(id);
  if (!order) notFound();

  const query = await searchParams;
  const done = typeof query?.done === 'string' ? query.done : null;
  const doneMessage = done ? copy.outcomes[done] : null;

  const isShipping = order.deliveryMethod === 'shipping';

  /*
    Which buttons exist. The repository checks all of this again in SQL; this is
    what stops her being offered something that would then quietly do nothing.
  */
  const canSettleRefund = order.refundDue && order.status === 'paid';
  const canShip = !order.refundDue && isShipping && order.status === 'paid';
  const canDeliver =
    !order.refundDue &&
    ((isShipping && order.status === 'shipped') || (!isShipping && order.status === 'paid'));
  const canCancel = !order.refundDue && (order.status === 'pending' || order.status === 'paid');
  const canRefund =
    !order.refundDue && ['paid', 'shipped', 'delivered'].includes(order.status);

  const hasActions = canSettleRefund || canShip || canDeliver || canCancel || canRefund;

  const timeline = [
    [copy.timelineCreated, order.dates.created],
    [copy.timelinePaid, order.dates.paid],
    [copy.timelineShipped, order.dates.shipped],
    [copy.timelineDelivered, order.dates.delivered],
    [copy.timelineRefundDue, order.dates.refundDue],
    [copy.timelineCancelled, order.dates.cancelled],
    [copy.timelineRefunded, order.dates.refunded],
  ].filter(([, value]) => Boolean(value));

  return (
    <Section as="div" size="tight">
      <Container>
        <div className={styles.header}>
          <h1 className={styles.title}>{copy.title}</h1>
          <Link className={styles.back} href="/admin/orders">
            {copy.back}
          </Link>
        </div>

        {doneMessage ? (
          <p className={styles.done} role="status">
            {doneMessage}
          </p>
        ) : null}

        {/*
          The order that owes somebody money. Said at the top, in full, because
          the actions below it make no sense without it — and because it explains
          why the paintings on this order are not going to be released.
        */}
        {order.refundDue ? (
          <p className={styles.urgent} role="alert">
            {copy.refundDueBanner}
          </p>
        ) : null}

        <p className={styles.reference}>
          <span className={styles.referenceLabel}>{copy.idLabel}</span>
          <bdi dir="ltr" className={styles.referenceValue}>
            {order.id}
          </bdi>
        </p>

        {/* ---- the buyer ---- */}
        <h2 className={styles.blockTitle}>{copy.buyerTitle}</h2>
        <dl className={styles.facts}>
          <dt>{copy.buyerName}</dt>
          <dd>{order.buyerName}</dd>
          <dt>{copy.buyerEmail}</dt>
          <dd>
            <bdi dir="ltr">{order.buyerEmail}</bdi>
          </dd>
          <dt>{copy.buyerPhone}</dt>
          <dd>
            <bdi dir="ltr">{order.buyerPhone}</bdi>
          </dd>
        </dl>

        {/* ---- what was bought ---- */}
        <h2 className={styles.blockTitle}>{copy.itemsTitle}</h2>
        <ul className={styles.lines}>
          {order.lines.map((line) => (
            <li key={line.workId} className={styles.line}>
              <Link className={styles.lineTitle} href={'/admin/works/' + line.workId}>
                {line.title}
              </Link>
              <span className={styles.lineState}>
                {/*
                  The painting's own state, because after a refund it changes —
                  and "the order is refunded" is only half an answer if she
                  cannot see that the painting came back as a draft.
                */}
                {line.workPublished ? copy.workPublished : copy.workDraft}
                {' · '}
                {dictionary.status[line.workStatus] ?? line.workStatus}
              </span>
              <span className={styles.lineAmount}>
                <bdi>{formatPrice(line.price, adminLocale)}</bdi>
              </span>
            </li>
          ))}
        </ul>

        {/* ---- how it travels ---- */}
        <h2 className={styles.blockTitle}>{copy.deliveryTitle}</h2>
        <dl className={styles.facts}>
          <dt>{copy.deliveryTitle}</dt>
          <dd>{isShipping ? copy.deliveryShipping : copy.deliveryPickup}</dd>

          {/*
            **A pickup order has no address, and this is where that matters.**
            `shipping_address` is nullable since migration 009 precisely so
            nobody has to invent one — so the absence is rendered as what it
            means, not as an empty address block with a blank beside it.
          */}
          {isShipping ? (
            <>
              <dt>{copy.addressLabel}</dt>
              <dd>{order.shippingAddress}</dd>
            </>
          ) : (
            <>
              <dt>{copy.addressLabel}</dt>
              <dd className={styles.pickupNote}>{copy.pickupNote}</dd>
            </>
          )}

          <dt>{copy.feeLabel}</dt>
          <dd>
            {order.deliveryFee.amount === 0 ? (
              copy.feeFree
            ) : (
              <bdi>{formatPrice(order.deliveryFee, adminLocale)}</bdi>
            )}
          </dd>

          <dt>{copy.referenceLabel}</dt>
          <dd>
            <bdi dir="ltr">{order.paymentReference ?? copy.referenceNone}</bdi>
          </dd>
        </dl>

        <p className={styles.totalRow}>
          <span className={styles.totalLabel}>{copy.totalLabel}</span>
          <span className={styles.totalAmount}>
            <bdi>{formatPrice(order.total, adminLocale)}</bdi>
          </span>
        </p>

        {/* ---- what has happened ---- */}
        <h2 className={styles.blockTitle}>{copy.timelineTitle}</h2>
        <ol className={styles.timeline}>
          {timeline.map(([label, value]) => (
            <li key={label} className={styles.event}>
              <span className={styles.eventLabel}>{label}</span>
              <span className={styles.eventDate}>
                <bdi>{formatDateTime(value, adminLocale)}</bdi>
              </span>
            </li>
          ))}
        </ol>

        {/* ---- what she can do ---- */}
        <h2 className={styles.blockTitle}>{copy.actionsTitle}</h2>

        {hasActions ? (
          <>
            <div className={styles.actions}>
              {canSettleRefund ? (
                <form action={settleOwedRefund.bind(null, order.id)}>
                  <button type="submit" className={styles.primary}>
                    {copy.actionSettleRefund}
                  </button>
                </form>
              ) : null}

              {canShip ? (
                <form action={advanceOrderStatus.bind(null, order.id, 'shipped')}>
                  <button type="submit" className={styles.primary}>
                    {copy.actionShip}
                  </button>
                </form>
              ) : null}

              {canDeliver ? (
                <form action={advanceOrderStatus.bind(null, order.id, 'delivered')}>
                  <button type="submit" className={styles.primary}>
                    {/*
                      A pickup order was handed over, not received in the post.
                      Same transition, and the word she would actually use.
                    */}
                    {isShipping ? copy.actionDeliver : copy.actionHandOver}
                  </button>
                </form>
              ) : null}

              {canCancel ? (
                <form action={cancelOrder.bind(null, order.id)}>
                  <button type="submit" className={styles.quiet}>
                    {copy.actionCancel}
                  </button>
                </form>
              ) : null}

              {canRefund ? (
                <form action={refundOrder.bind(null, order.id)}>
                  <button type="submit" className={styles.quiet}>
                    {copy.actionRefund}
                  </button>
                </form>
              ) : null}
            </div>

            {/*
              What cancelling or refunding does to the paintings, said before she
              presses either. They come back as drafts rather than straight onto
              the site, and that is a decision she should not have to discover.
            */}
            {canCancel || canRefund ? (
              <p className={styles.releaseNote}>{copy.releaseNote}</p>
            ) : null}
          </>
        ) : (
          <p className={styles.noActions}>{copy.actionsNone}</p>
        )}
      </Container>
    </Section>
  );
}
