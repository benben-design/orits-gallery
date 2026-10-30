import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkWall from '@/components/ui/ArtworkWall';
import ButtonLink from '@/components/ui/ButtonLink';
import { localeHref } from '@/lib/i18n/config';
import styles from './MoreWorks.module.css';

/**
 * "More works" — the end of an artwork page, so that a visitor who reached the
 * last line of one painting has somewhere to go other than the footer.
 *
 * **It belongs to the public route alone, and that is why it is here and not in
 * `ArtworkDetail`.** The admin preview renders that body too, and a list of
 * other paintings is the site's navigation, not part of the work being
 * previewed. Living outside the shared body makes that true by construction
 * rather than by a flag somebody could pass wrongly.
 *
 * Which works, and in what order, is the repository's decision
 * (`getMoreWorks`): buyable first, the same category before the other, the
 * current work never. This only draws what it is handed, and draws nothing when
 * that is empty.
 *
 * **The works hang on the wall** (components/ui/ArtworkWall, 30-10-2026) —
 * the gallery's and the homepage's, so a painting reads the same here as there:
 * its own ratio on a thin board, two columns on a phone, three from 40rem, four
 * from 64rem. They rise as they scroll in like every card (components/layout/
 * QuietMotion). The titles are `h3`s under this
 * section's `h2`, which sits under the work's `h1`.
 *
 * **The way on is the whole gallery.** It used to be the rest of the work's own
 * category, and that went with the gallery's category filter on 26-10-2026.
 *
 * @param {object} props
 * @param {object[]} props.works - From `getMoreWorks`.
 * @param {string} props.locale
 * @param {object} props.dictionary - The public dictionary.
 */

export default function MoreWorks({ works, locale, dictionary }) {
  if (!works?.length) return null;

  const copy = dictionary.artwork;

  return (
    /* A generous gap above: the subject changes from one painting to the body of work. */
    <Section before="generous">
      <Container>
        <SectionHeading>{copy.moreWorksHeading}</SectionHeading>

        <ArtworkWall works={works} locale={locale} dictionary={dictionary} />

        <div className={styles.actions}>
          <ButtonLink href={localeHref(locale, '/gallery')}>{dictionary.home.works.viewAll}</ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
