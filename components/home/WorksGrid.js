import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkCard from '@/components/ui/ArtworkCard';
import ButtonLink from '@/components/ui/ButtonLink';
import { localeHref } from '@/lib/i18n/config';
import styles from './WorksGrid.module.css';

/**
 * Homepage section 2 — twelve works, each with title, price and status, and a
 * way through to the full gallery.
 *
 * The grid is uniform: every cell is the same fixed frame, so the nine
 * portraits, five near-squares and two landscapes in the collection all sit in
 * identical boxes and every row lines up. The paintings themselves are scaled
 * to fit inside those boxes rather than filling them, so none is cropped. That
 * rule lives in components/ui/ArtworkFrame.
 *
 * Nothing here is marked `priority`: the grid starts well below the fold, and
 * eager-loading it would compete with the hero for LCP. The hero is the only
 * priority image on the page. See .claude/rules/images.md.
 */

/**
 * Widths the grid actually renders at, so the browser can pick a sensible
 * source. Sized for the sharp replacement scans, not for the low-resolution
 * files currently in public/paintings.
 */
const CARD_SIZES = '(max-width: 40rem) 92vw, (max-width: 64rem) 44vw, 22rem';

export default function WorksGrid({ works, locale, dictionary }) {
  if (!works?.length) {
    return (
      <Section>
        <Container>
          <p>{dictionary.gallery.empty}</p>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <SectionHeading intro={dictionary.home.works.intro}>
          {dictionary.home.works.heading}
        </SectionHeading>

        <ul className={styles.grid}>
          {works.map((work) => (
            <li key={work.id} className={styles.cell}>
              <ArtworkCard
                work={work}
                locale={locale}
                dictionary={dictionary}
                sizes={CARD_SIZES}
              />
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <ButtonLink href={localeHref(locale, '/gallery')}>
            {dictionary.home.works.viewAll}
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
