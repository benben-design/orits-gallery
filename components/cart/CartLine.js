import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import StatusBadge from '@/components/ui/StatusBadge';
import Price from '@/components/ui/Price';
import { getStatusPresentation, isBuyable } from '@/components/ui/statusPresentation';
import { mediumLabel } from '@/components/ui/mediumLabel';
import { removeWorkFromCart } from '@/lib/cart/actions';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatDimensions } from '@/lib/format';
import styles from './CartLine.module.css';

/**
 * One painting in the cart.
 *
 * **It is a hand-list entry, not a basket row.** Every line here is a single
 * physical object rather than a quantity of a product, so it carries the same
 * furniture the grid card does — the frame that never crops, the price, the
 * badge — at a smaller size, and no quantity control. There is nothing to
 * increment. See commerce.md.
 *
 * The frame keeps the **mounted** tone. images.md is explicit about which case
 * takes which: several small works warm-on-warm each need their own edge,
 * and only one large work alone gets `bare`. A cart is the first case.
 *
 * A work that can no longer be bought still gets a full line rather than being
 * swept away. Seeing that the painting you wanted has gone is the honest
 * answer, and the alternative — quietly dropping it — is the site deciding you
 * had not meant it. `Price` already strikes a sold amount and `StatusBadge`
 * already names the state, so the only thing added here is the sentence saying
 * it is not in the total.
 *
 * @param {object} props
 * @param {object} props.work - A work as the repository returns it.
 * @param {string} props.locale
 * @param {object} props.dictionary
 */

/** The frame renders about 6rem wide; ask the loader for no more than that. */
const THUMBNAIL_SIZES = '7rem';

export default function CartLine({ work, locale, dictionary }) {
  const title = work.title[locale];
  const medium = mediumLabel(work, locale, dictionary);
  const mainImage = work.images.find((image) => image.type === 'main') ?? work.images[0];
  const href = localeHref(locale, `/art/${work.slug[locale]}`);
  const available = isBuyable(work.status);

  /*
    Bound, not a named form field — though Next renders bound arguments into
    the form in plain text, so this is tidiness rather than protection. It needs
    none: removing takes nothing on trust, and an id that was never in the cart
    leaves it exactly as it was.

    The action returns the cart rather than redirecting, and this form ignores
    what comes back. It does not need it: `/cart` reads the cookie on every
    render, so the re-render Next performs after the action already shows the
    painting gone. That is also what keeps this page working with no JavaScript
    at all, which the drawer does not.
  */
  const remove = removeWorkFromCart.bind(null, work.id);

  return (
    <article className={[styles.line, available ? '' : styles.unavailable].filter(Boolean).join(' ')}>
      <Link href={href} className={styles.thumbnail} tabIndex={-1} aria-hidden="true">
        <ArtworkFrame
          image={mainImage}
          alt=""
          emptyLabel={dictionary.artwork.noImage}
          sizes={THUMBNAIL_SIZES}
        />
      </Link>

      <div className={styles.details}>
        {/*
          The title is the link that carries the accessible name for this line;
          the thumbnail above is the same destination and is hidden from
          assistive technology rather than announced twice.
        */}
        <h2 className={styles.title}>
          <Link href={href} className={styles.titleLink}>
            {title}
          </Link>
        </h2>

        <p className={styles.spec}>
          {medium ? (
            <>
              <span>{medium}</span>
              <span aria-hidden="true" className={styles.separator} />
            </>
          ) : null}
          {/* A Latin-and-digits run inside Hebrew prose, isolated as elsewhere. */}
          <bdi>{formatDimensions(work.dimensions)}</bdi>
        </p>

        {available ? null : (
          <p className={styles.note}>{dictionary.cart.unavailableNote}</p>
        )}
      </div>

      {/*
        Price and status, from the same two components every other surface uses
        and reading the same table — so a work cannot read "sold" one way here
        and another way in the gallery.

        **It is a column of its own rather than another line under the title,
        because this list has a total.** Prices stacked in one column are what
        lets the eye run down them and arrive at the sum; the same figures
        ragged inside four text blocks are four unrelated numbers with an
        unexplained total beneath them. Below 40rem there is no room for a
        fourth column and it folds back under the details, where the sum is
        close enough to read as one thing anyway.
      */}
      <p className={styles.meta}>
        <Price
          price={work.price}
          locale={locale}
          dictionary={dictionary}
          isPlaceholder={work.hasPlaceholderData}
          status={work.status}
          /* Stacks the "sample price" marker under the amount, so the amounts
             themselves share an edge down the column. See Price.js. */
          className={styles.price}
        />
        {getStatusPresentation(work.status).badge ? (
          <>
            <span aria-hidden="true" className={styles.separator} />
            <StatusBadge status={work.status} dictionary={dictionary} />
          </>
        ) : null}
      </p>

      <form action={remove} className={styles.removeForm}>
        <button
          type="submit"
          className={styles.remove}
          /*
            Names the painting, so a list of five identical "Remove" buttons is
            distinguishable. It opens with the same word the button shows, which
            is what keeps voice control able to act on what it can see.
          */
          aria-label={interpolate(dictionary.cart.removeLabel, { title })}
        >
          {/* Trash2, not X: the drawer's close control is the X now, and one
              glyph must not mean both "shut this panel" and "remove this work". */}
          <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
          <span>{dictionary.cart.remove}</span>
        </button>
      </form>
    </article>
  );
}
