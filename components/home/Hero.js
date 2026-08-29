import Container from '@/components/ui/Container';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import { interpolate } from '@/lib/i18n/interpolate';
import styles from './Hero.module.css';

/**
 * Homepage section 1 — one large painting and a single positioning line.
 *
 * A static image by design: no carousel, no slider, no autoplay. One work,
 * held still, the way a gallery hangs the piece you see first.
 *
 * The featured work is chosen by the data layer (getFeaturedWork), not here.
 * It is the only landscape-format piece in the collection, which is what lets
 * the hero be wide.
 */
export default function Hero({ work, locale, dictionary }) {
  if (!work) return null;

  const title = work.title[locale];
  const image = work.images.find((item) => item.type === 'main') ?? work.images[0];

  return (
    <section className={styles.hero}>
      <Container>
        <div className={styles.frame}>
          <ArtworkFrame
            image={image}
            alt={interpolate(dictionary.home.hero.imageAlt, {
              title,
              artist: dictionary.site.artistName,
            })}
            /* Close to the work's own 1.47, so the padding stays even. */
            ratio="3 / 2"
            tone="bare"
            sizes="(max-width: 60rem) 92vw, 72rem"
            /* The largest above-the-fold image on the site. */
            priority
          />
        </div>

        <div className={styles.text}>
          <p className={styles.positioning}>{dictionary.home.hero.positioning}</p>
          <p className={styles.caption}>{title}</p>
        </div>
      </Container>
    </section>
  );
}
