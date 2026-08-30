import Image from 'next/image';
import Container from '@/components/ui/Container';
import HeroVideo from './HeroVideo';
import styles from './Hero.module.css';

/**
 * Homepage section 1 — the artist at work, and a single positioning line.
 *
 * The hero is footage of Orit painting rather than one of the paintings. That
 * is a deliberate reversal of the original plan, and the reason is redundancy:
 * the works grid sits immediately below and shows twelve paintings, so a
 * thirteenth painting above it was doing the grid's job worse, on the most
 * valuable screen of the site. What the grid *cannot* say is that these are
 * physical objects made by hand by a named person — which is exactly what a
 * first-time buyer arriving from Instagram needs before sending ₪2,000.
 *
 * Structure, and why it is split this way:
 *
 *   - The POSTER is a server-rendered next/image with `priority`. It is the
 *     LCP element and it is a complete hero on its own.
 *   - The LOOP is a client component layered over it, deferred until the page
 *     has gone quiet, and skipped entirely under reduced-motion or Save-Data.
 *     See HeroVideo.js.
 *
 * The text sits BELOW the frame rather than over it. Overlaying was considered
 * and rejected: the quiet corner of the footage is on one side of the frame,
 * but this site is right-to-left by default, so a headline anchored to the
 * inline-start lands on opposite sides of the image in Hebrew and English —
 * over the quiet canvas in one language and over the brush in the other. Text
 * below is legible in both, and needs no scrim darkening footage whose colour
 * is the point.
 */

/* ------------------------------------------------------------------ *
 * Assets. Both live in public/video/.
 * ------------------------------------------------------------------ */

/**
 * 1080x810 — a 4:3 crop of the vertical original, slowed.
 *
 * Taller than the 16:9 export it replaced, which is what makes it the better
 * source: width is capped at 1080 either way, so the extra height is free
 * latitude for the frame to crop to any ratio it likes without running out of
 * pixels. It also lets the phone breakpoint show the footage nearly whole.
 */
const HERO_VIDEO = '/video/wide-4x3-slow50.mp4';

/**
 * PENDING. The still frame is the LCP element and the hero's whole fallback,
 * so this is the one asset the section is not complete without. Set it to
 * '/video/hero-cherries-poster.jpg' when the file lands and the poster renders
 * automatically — nothing else has to change.
 */
const HERO_POSTER = null;

export default function Hero({ dictionary }) {
  return (
    <section className={styles.hero}>
      <Container>
        <div className={styles.frame}>
          {HERO_POSTER ? (
            <Image
              className={styles.poster}
              src={HERO_POSTER}
              alt={dictionary.home.hero.posterAlt}
              /**
               * `fill` rather than explicit dimensions, which is the opposite
               * of the rule for paintings — and correct here for the same
               * reason the crop is. The frame already reserves the box via
               * aspect-ratio so there is no layout shift to guard against, and
               * the still is framed to match the loop underneath it.
               */
              fill
              /* The frame fills the Container: 80rem less its 4rem gutters. */
              sizes="(max-width: 84rem) 92vw, 76rem"
              priority
            />
          ) : null}

          <HeroVideo src={HERO_VIDEO} />
        </div>

        <div className={styles.text}>
          <p className={styles.eyebrow}>{dictionary.site.artistName}</p>
          <p className={styles.positioning}>{dictionary.home.hero.positioning}</p>
        </div>
      </Container>
    </section>
  );
}
