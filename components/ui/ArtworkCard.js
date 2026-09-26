import Link from 'next/link';
import ArtworkFrame from './ArtworkFrame';
import StatusBadge from './StatusBadge';
import Price from './Price';
import { getStatusPresentation } from './statusPresentation';
import { mediumLabel } from './mediumLabel';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatDimensions } from '@/lib/format';
import styles from './ArtworkCard.module.css';

/**
 * One painting in a grid: the framed work, its title, price and status.
 *
 * Every string comes from the dictionary; the only text this component
 * produces itself is the work's own title, which is data.
 *
 * `titleAs` sets the title's heading level, because that depends on the page
 * rather than on the card: an <h3> under the homepage grid's <h2>, an <h2>
 * directly under the gallery's <h1>. The look does not change with it —
 * `.title` sets its own size and weight, and globals.css styles every heading
 * level alike.
 */
export default function ArtworkCard({
  work,
  locale,
  dictionary,
  sizes,
  priority = false,
  titleAs: TitleTag = 'h3',
}) {
  const title = work.title[locale];
  const medium = mediumLabel(work, locale, dictionary);
  const mainImage = work.images.find((image) => image.type === 'main') ?? work.images[0];
  const href = localeHref(locale, `/art/${work.slug[locale]}`);

  return (
    <article className={styles.card}>
      <Link href={href} className={styles.link}>
        <ArtworkFrame
          image={mainImage}
          alt={interpolate(dictionary.artwork.imageAlt, {
            title,
            artist: dictionary.site.artistName,
          })}
          /* A work entered in the admin has no photograph until one is
             attached, so mainImage is legitimately undefined here. */
          emptyLabel={dictionary.artwork.noImage}
          sizes={sizes}
          priority={priority}
        />
        <div className={styles.caption}>
          <TitleTag className={styles.title}>{title}</TitleTag>

          {/*
            Medium and size, in the secondary ink. The size is a placeholder
            value on every record today — a deliberately absurd one — so this
            line is where "999 × 999 cm" becomes visible. That is the intent:
            see data-layer.md.

            Medium is optional and every current row has none, so it and its
            separator are drawn only when there is one. Otherwise the hairline
            leads a line that starts with nothing, which is the same orphaned
            rule the price row below is careful to avoid.

            The dimensions are wrapped in <bdi> because they are a Latin-and-
            digits run inside a right-to-left paragraph. Without isolation the
            trailing unit reorders against the numbers in Hebrew.
          */}
          <p className={styles.spec}>
            {medium ? (
              <>
                <span>{medium}</span>
                <span aria-hidden="true" className={styles.separator} />
              </>
            ) : null}
            <bdi>{formatDimensions(work.dimensions)}</bdi>
          </p>

          {/*
            Price and status share a row. Status is commercial metadata about
            the work, not part of the picture, and is deliberately never
            overlaid on the mount: a label floating over a painting is a shop
            convention that cheapens the work.

            Only two statuses draw a badge, so the separator is conditional —
            otherwise an available work gets a hairline rule pointing at
            nothing. Both halves read the same table, so the price treatment and
            the badge can never disagree about a state.
          */}
          <p className={styles.meta}>
            <Price
              price={work.price}
              locale={locale}
              dictionary={dictionary}
              isPlaceholder={work.hasPlaceholderData}
              status={work.status}
            />
            {getStatusPresentation(work.status).badge ? (
              <>
                <span aria-hidden="true" className={styles.separator} />
                <StatusBadge status={work.status} dictionary={dictionary} />
              </>
            ) : null}
          </p>
        </div>
      </Link>
    </article>
  );
}
