import Link from 'next/link';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { formatPrice, formatDateTime } from '@/lib/format';
import { getOrdersForAdmin } from '@/lib/data/orders-repository';
import styles from './page.module.css';

/**
 * /admin/orders — every order, and the two things that need chasing.
 *
 * **This page is the artist's only notification that anything sold.** Nothing
 * emails her, nothing texts her, and Hyp sends nothing either — so what is drawn
 * here is the entire mechanism by which she finds out. That is why a row leads
 * with the painting titles rather than an order number: "an order" is not news.
 *
 * Two things are surfaced above the list, and neither is decoration:
 *
 * - **An owed refund is the most urgent thing on the page.** Money was taken for
 *   a painting that could not be delivered and the charge could not be voided.
 *   Nothing automates the refund — she makes it by hand in the Hyp console — so
 *   if she does not see it, a buyer is simply out of pocket.
 * - **An order pending for more than an hour may be a payment nobody knows
 *   about.** With no webhook and no transaction-status query, a buyer who paid
 *   and closed the window before the redirect leaves a row indistinguishable
 *   from one nobody ever paid for. **No amount of code can close that**; the only
 *   answer is a person checking the Hyp console, so the page says exactly that.
 *   See api.md.
 *
 * Both are also badged on their own rows, because the blocks explain and the
 * badges locate. Neither is carried by colour alone.
 *
 * Guarded, and the path is passed so signing in returns here.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);

  /* A fixed dictionary string, never record data — see security.md. */
  return { title: dictionary.admin.orders.title };
}

export default async function AdminOrdersPage() {
  await requireAdminSession('/admin/orders');

  const dictionary = await getDictionary(adminLocale);
  const copy = dictionary.admin.orders;
  const orders = await getOrdersForAdmin();

  const refundDue = orders.filter((order) => order.refundDue);
  const stale = orders.filter((order) => order.stalePending);
  const unclosed = orders.filter((order) => order.unclosedDispatch);

  return (
    <Section as="div" size="tight">
      <Container>
        <div className={styles.header}>
          <h1 className={styles.title}>{copy.title}</h1>
        </div>

        {/*
          First, and loudest. `role="alert"` rather than `status`: this is money
          owed to somebody, and it is the one thing on this page that is worse
          for being noticed late.
        */}
        {refundDue.length > 0 ? (
          <div className={styles.urgent} role="alert">
            <h2 className={styles.urgentTitle}>{copy.refundDueTitle}</h2>
            <p className={styles.blockBody}>{copy.refundDueBody}</p>
            <ul className={styles.blockList}>
              {refundDue.map((order) => (
                <li key={order.id}>
                  <Link className={styles.blockLink} href={'/admin/orders/' + order.id}>
                    {order.titles.length > 0 ? order.titles.join(', ') : order.buyerName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {stale.length > 0 ? (
          <div className={styles.chase} role="status">
            <h2 className={styles.chaseTitle}>{copy.staleTitle}</h2>
            <p className={styles.blockBody}>{copy.staleBody}</p>
            <ul className={styles.blockList}>
              {stale.map((order) => (
                <li key={order.id}>
                  <Link className={styles.blockLink} href={'/admin/orders/' + order.id}>
                    {order.titles.length > 0 ? order.titles.join(', ') : order.buyerName}
                    {' · '}
                    {formatDateTime(order.createdAt, adminLocale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/*
          The third reconciliation job, and the quietest of the three: a painting
          posted a week ago that nobody has marked as arrived.

          **Its 14-day cancellation window cannot be computed until somebody
          does.** The law counts from receipt, and an order sitting at `shipped`
          with no receipt date is indistinguishable from a parcel still in
          transit — no constraint can fix that, and a default date would be one
          nobody observed and would then be counted from. See commerce.md.
        */}
        {unclosed.length > 0 ? (
          <div className={styles.chase} role="status">
            <h2 className={styles.chaseTitle}>{copy.dispatchTitle}</h2>
            <p className={styles.blockBody}>{copy.dispatchBody}</p>
            <ul className={styles.blockList}>
              {unclosed.map((order) => (
                <li key={order.id}>
                  <Link className={styles.blockLink} href={'/admin/orders/' + order.id}>
                    {order.titles.length > 0 ? order.titles.join(', ') : order.buyerName}
                    {' · '}
                    {formatDateTime(order.shippedAt, adminLocale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {orders.length === 0 ? (
          <p className={styles.empty}>{copy.empty}</p>
        ) : (
          <ul className={styles.list}>
            {orders.map((order) => (
              <li
                key={order.id}
                className={[styles.row, order.refundDue ? styles.rowUrgent : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <Link className={styles.open} href={'/admin/orders/' + order.id}>
                  <span className={styles.body}>
                    {/*
                      What sold, first. This is the sentence she is here to read.
                    */}
                    <span className={styles.works}>
                      {order.titles.length > 0 ? order.titles.join(', ') : copy.noItems}
                    </span>

                    <span className={styles.states}>
                      {/*
                        The status as a word, for all six values — the same
                        arrangement the works list uses for the four sale
                        statuses, and for the same reason: she needs to see which
                        state every row is in, including the quiet ones.
                      */}
                      <span className={styles.status}>
                        {statusWord(order.status, dictionary)}
                      </span>

                      <span className={styles.method}>
                        {order.deliveryMethod === 'shipping'
                          ? copy.deliveryShipping
                          : copy.deliveryPickup}
                      </span>

                      <span className={styles.buyer}>{order.buyerName}</span>

                      <span className={styles.placed}>
                        {copy.placed} <bdi>{formatDateTime(order.createdAt, adminLocale)}</bdi>
                      </span>
                    </span>

                    {/*
                      The badges. They repeat what the blocks above already said,
                      because the block explains and the badge locates — with
                      thirty rows, a warning at the top with no marker on the row
                      is a warning she has to search for.
                    */}
                    {order.refundDue || order.stalePending || order.unclosedDispatch ? (
                      <span className={styles.flags}>
                        {order.refundDue ? (
                          <span className={styles.refundFlag}>{copy.refundDueBadge}</span>
                        ) : null}
                        {order.stalePending ? (
                          <span className={styles.staleFlag}>{copy.staleBadge}</span>
                        ) : null}
                        {order.unclosedDispatch ? (
                          <span className={styles.staleFlag}>{copy.dispatchBadge}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>

                  <span className={styles.total}>
                    <bdi>{formatPrice(order.total, adminLocale)}</bdi>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}

/**
 * The order status as a word.
 *
 * The six order statuses are not the four sale statuses, so they do not share
 * `dictionary.status` — that one belongs to paintings. These live with the order
 * pages that use them.
 */
function statusWord(status, dictionary) {
  const order = dictionary.admin.order;

  const words = {
    pending: order.timelineCreated,
    paid: order.timelinePaid,
    shipped: order.timelineShipped,
    delivered: order.timelineDelivered,
    cancelled: order.timelineCancelled,
    refunded: order.timelineRefunded,
  };

  /* An unknown status shows itself rather than nothing — visible beats silent. */
  return words[status] ?? status;
}
