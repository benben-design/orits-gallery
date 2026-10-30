import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkWall from '@/components/ui/ArtworkWall';
import ButtonLink from '@/components/ui/ButtonLink';
import { localeHref } from '@/lib/i18n/config';
import styles from './WorksGrid.module.css';

/**
 * Homepage section 2 — the starred works (or the twelve most recent), each with title, price and status, and a
 * way through to the full gallery.
 *
 * The works hang on the wall the gallery uses (components/ui/ArtworkWall):
 * each painting at its own ratio, the full width of its column, on a thin
 * board, so a wide landscape is no longer the smallest thing on the page.
 * Nothing is cropped; that rule lives in components/ui/ArtworkFrame.
 *
 * Nothing here is marked `priority`: the grid starts well below the fold, and
 * eager-loading it would compete with the hero for LCP. The hero is the only
 * priority image on the page. See .claude/rules/images.md.
 */

export default function WorksGrid({ works, locale, dictionary }) {
  if (!works?.length) {
    return (
      <Section before="generous">
        <Container>
          <p>{dictionary.gallery.empty}</p>
        </Container>
      </Section>
    );
  }

  // A generous gap above: the hero is about her making the work, and this
  // is where the subject changes to the work itself.
  return (
    <Section before="generous">
      <Container>
        <SectionHeading intro={dictionary.home.works.intro}>
          {dictionary.home.works.heading}
        </SectionHeading>

        <ArtworkWall works={works} locale={locale} dictionary={dictionary} />

        <div className={styles.actions}>
          <ButtonLink href={localeHref(locale, '/gallery')}>
            {dictionary.home.works.viewAll}
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
