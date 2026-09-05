import Link from 'next/link';
import { notFound } from 'next/navigation';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { getWorkById } from '@/lib/data/works-repository';
import { MANUAL_SALE_CHANNELS } from '@/lib/data/work-input';
import { markWorkSold, returnWorkToSale } from '@/app/(admin)/admin/actions';
import styles from './page.module.css';

/**
 * /admin/works/[id]/sale — did it sell, and where.
 *
 * **One page asking a different question depending on where the work is**, the
 * same way the delete confirmation asks one thing of a draft and another of a
 * published work. Three states, and the third is the interesting one:
 *
 *   - **Not sold** — where did it sell? Two buttons, one per channel, and
 *     pressing one *is* the answer. There is no select and no separate submit,
 *     because the channel and the status are one fact and asking them
 *     separately would be the second screen of form this replaces.
 *   - **Sold by hand** — put it back on sale, which also clears the channel.
 *     The way back has to be as easy as the way in, or the mistake is harder to
 *     undo than it was to make.
 *   - **Sold through this site** — refused, and the refusal is the content of
 *     the page. That channel is a claim that an order exists, so returning the
 *     work to sale asserts money went back rather than that somebody misclicked.
 *     A heavier confirmation would still let her do it from a list of
 *     paintings, and commerce.md is explicit that nothing which later happens
 *     to the catalogue may change what an order says.
 *
 * **Why a page at all, rather than controls on the row.** It names the painting
 * before anything changes. Marking the wrong row sold pulls a live painting off
 * sale and nothing announces it — on a phone, at a fair, adjacent rows are one
 * mis-tap apart. It is reversible, unlike deleting, which is why one link and
 * one button is the whole ceremony and there is no second "are you sure".
 *
 * **No JavaScript anywhere.** Getting here is a plain link that changes
 * nothing; every control is a form post to a Server Action with its arguments
 * bound server-side, so the browser cannot repoint one at another painting or
 * at a channel it was not offered.
 *
 * Guarded, and guarded before the lookup — an unauthenticated request never
 * reaches the database and cannot tell an existing id from a missing one.
 * **Metadata carries no record data**, because `generateMetadata` runs even
 * when the guard redirects. See security.md.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.saleState.title };
}

export default async function AdminWorkSalePage({ params, searchParams }) {
  const { id } = await params;
  await requireAdminSession('/admin/works/' + encodeURIComponent(id) + '/sale');

  const query = await searchParams;
  const dictionary = await getDictionary(adminLocale);

  // ADMIN scope: a work sold at a fair may well still be a draft.
  const work = await getWorkById(id);
  if (!work) notFound();

  const labels = dictionary.admin.saleState;

  const isSold = work.status === 'sold';
  const isSiteSale = work.saleChannel === 'this-site';

  /*
    Why the last attempt did nothing, carried in the URL rather than through
    `useActionState` — which is what keeps this page a server component. There
    is no typed input to preserve, only a code to pick a sentence with, and an
    unknown code renders nothing.
  */
  const outcome = typeof query?.outcome === 'string' ? query.outcome : null;
  const message = outcome ? labels.outcomes[outcome] : null;

  const workPath = '/admin/works/' + encodeURIComponent(work.id);

  return (
    <Section as="div" size="tight">
      <Container width="measure">
        <h1 className={styles.title}>
          {isSold ? labels.returnTitle : labels.markTitle}
        </h1>

        {/* Which painting. In the body, where the guard has already run. */}
        <p className={styles.subject}>{work.title[adminLocale]}</p>

        {message ? (
          <p className={styles.outcome} role="alert">
            {message}
          </p>
        ) : null}

        {isSiteSale ? (
          /*
            The refusal, and it is the whole page rather than a disabled button.
            A control that cannot be used still reads as a control that ought to
            work; a sentence saying why does not. It names what the site knows —
            money moved through here — and where the decision actually belongs,
            which is an order rather than a painting.
          */
          <>
            <p className={styles.warning}>{labels.siteSaleWarning}</p>
            <p className={styles.note}>{labels.siteSaleNote}</p>
          </>
        ) : isSold ? (
          <>
            <p className={styles.warning}>{labels.returnWarning}</p>

            {/*
              What it will also do. Said before the button rather than after,
              because clearing the channel is the part she did not ask for and
              would not otherwise expect.
            */}
            <p className={styles.note}>{labels.returnClearsChannel}</p>

            <div className={styles.decision}>
              <form action={returnWorkToSale.bind(null, work.id)}>
                <button type="submit" className={styles.primary}>
                  {labels.returnAction}
                </button>
              </form>

              <Link className={styles.cancel} href={workPath}>
                {labels.cancel}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className={styles.warning}>{labels.markWarning}</p>

            {/*
              One button per channel, built from the exported constant rather
              than from two literals — so the day a third hand-recorded channel
              exists, this page offers it without being edited. `this-site` is
              absent from that constant by design: checkout writes it and the
              admin never does.

              Each form binds its own channel server-side. Next signs bound
              arguments, so a browser cannot submit a channel it was not given.
            */}
            <div className={styles.channels}>
              {MANUAL_SALE_CHANNELS.map((channel) => (
                <form key={channel} action={markWorkSold.bind(null, work.id, channel)}>
                  <button type="submit" className={styles.primary}>
                    {labels.markAction} {dictionary.saleChannel[channel] ?? channel}
                  </button>
                </form>
              ))}
            </div>

            <div className={styles.decision}>
              <Link className={styles.cancel} href={workPath}>
                {labels.cancel}
              </Link>
            </div>
          </>
        )}
      </Container>
    </Section>
  );
}
