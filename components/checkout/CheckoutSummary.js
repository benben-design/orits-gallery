import Link from 'next/link';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import Price from '@/components/ui/Price';
import { mediumLabel } from '@/components/ui/mediumLabel';
import { localeHref } from '@/lib/i18n/config';
import { formatDimensions } from '@/lib/format';
import styles from './CheckoutSummary.module.css';

/**
 * What is being bought, at the top of the checkout.
 *
 * **A server component, and deliberately not `CartLine`.** It is the same
 * furniture — the frame that never crops, the medium, the size, the price, at
 * the same rhythm of hairline-separated rows — built from the same primitives so
 * the two surfaces match. What it does not have is a remove control, and that is
 * the reason it is its own component rather than a flag on the cart's: editing
 * the order belongs on the cart page, one step back. A checkout that lets you
 * pull a painting out halfway through is a checkout that has to re-price itself
 * mid-form, and the cart already does that job properly.
 *
 * Every work here has already been filtered to the ones that can be bought, so
 * there is no badge, no struck price and no "no longer available" line to draw.
 * The page above decides that; see its note on the three outcomes.
 *
 * @param {object} props
 * @param {object[]} props.works - Works as the repository returns them.
 * @param {string} props.locale
 * @param {object} props.dictionary
 */

/** The frame renders about 5rem wide here; ask the loader for no more. */
const THUMBNAIL_SIZES = '6rem';

export default function CheckoutSummary({ works, locale, dictionary }) {
  return (
    <ul className={styles.lines} aria-label={dictionary.checkout.listLabel}>
      {works.map((work) => {
        const title = work.title[locale];
        const medium = mediumLabel(work, locale, dictionary);
        const mainImage = work.images.find((image) => image.type === 'main') ?? work.images[0];
        const href = localeHref(locale, `/art/${work.slug[locale]}`);

        return (
          <li key={work.id} className={styles.line}>
            {/*
              The thumbnail repeats the title's destination, so it is hidden from
              assistive technology rather than announced twice — the same
              arrangement CartLine uses.
            */}
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
                An h3: the page's h1 is the checkout itself and the summary's
                heading is an h2, so a painting sits one level below that.
              */}
              <h3 className={styles.title}>
                <Link href={href} className={styles.titleLink}>
                  {title}
                </Link>
              </h3>

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
            </div>

            <p className={styles.amount}>
              <Price
                price={work.price}
                locale={locale}
                dictionary={dictionary}
                isPlaceholder={work.hasPlaceholderData}
                status={work.status}
                className={styles.price}
              />
            </p>
          </li>
        );
      })}
    </ul>
  );
}
