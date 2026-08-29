import Link from 'next/link';
import ArtworkFrame from './ArtworkFrame';
import StatusBadge from './StatusBadge';
import Price from './Price';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import styles from './ArtworkCard.module.css';

/**
 * One painting in a grid: the framed work, its title, price and status.
 *
 * Every string comes from the dictionary; the only text this component
 * produces itself is the work's own title, which is data.
 */
export default function ArtworkCard({ work, locale, dictionary, sizes, priority = false }) {
  const title = work.title[locale];
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
          sizes={sizes}
          priority={priority}
        />
        <div className={styles.caption}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.meta}>
            <Price
              price={work.price}
              locale={locale}
              dictionary={dictionary}
              isPlaceholder={work.hasPlaceholderData}
            />
            <span aria-hidden="true" className={styles.separator} />
            <StatusBadge status={work.status} dictionary={dictionary} />
          </p>
        </div>
      </Link>
    </article>
  );
}
