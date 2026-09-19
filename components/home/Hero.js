import Image from 'next/image';
import Container from '@/components/ui/Container';
import ButtonLink from '@/components/ui/ButtonLink';
import { localeHref } from '@/lib/i18n/config';
import HeroVideo from './HeroVideo';
import styles from './Hero.module.css';

/**
 * Homepage section 1 — the artist at work, a single positioning line, and the
 * way into the paintings.
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
 * **The loop sits on top of the poster and is never a replacement for it**, and
 * that is what makes stopping it possible at all: the control in HeroVideo
 * fades the video out rather than unmounting it, and the still underneath is
 * simply uncovered. So "not playing" is one defined picture — the same one
 * whether the visitor stopped it, asked their system for reduced motion, or
 * arrived before the video did — rather than a frozen frame wherever the loop
 * happened to be.
 *
 * The text sits BELOW the frame rather than over it. Overlaying was considered
 * and rejected: the quiet corner of the footage is on one side of the frame,
 * but this site is right-to-left by default, so a headline anchored to the
 * inline-start lands on opposite sides of the image in Hebrew and English —
 * over the quiet canvas in one language and over the brush in the other. Text
 * below is legible in both, and needs no scrim darkening footage whose colour
 * is the point.
 *
 * **It ends in one action**, the filled accent into the gallery. Without it the
 * only control on the first screen was the one that stops the video, and on a
 * laptop that screen ends before the first painting — a shop whose opening view
 * offered nothing to do but stop a film.
 *
 * The artist's name is no longer repeated here. It sat above the positioning
 * line because the header's wordmark was 17px and read as navigation; the
 * wordmark now carries it at display size, and saying it twice on one screen
 * was the duplication.
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
 * The still, and **a frame of the loop itself** rather than a second
 * photograph — extracted from `wide-4x3-slow50.mp4` at 2.93s, at the source's
 * own 1080x810.
 *
 * That it is the same footage is the point rather than a convenience. It is
 * what the visitor sees before the loop arrives, whenever they stop the loop,
 * and instead of the loop under reduced motion — so a different image would
 * make stopping the video a change of subject, and would make the alt text
 * below true of only one of the two states.
 */
const HERO_POSTER = '/video/hero-cherries-poster.jpg';

export default function Hero({ locale, dictionary }) {
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

          <HeroVideo
            src={HERO_VIDEO}
            pauseLabel={dictionary.home.hero.pauseMotion}
            playLabel={dictionary.home.hero.playMotion}
          />
        </div>

        <div className={styles.text}>
          <p className={styles.positioning}>{dictionary.home.hero.positioning}</p>
          <ButtonLink href={localeHref(locale, '/gallery')} variant="primary">
            {dictionary.home.hero.cta}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
