import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ArtworkCard from '@/components/ui/ArtworkCard';
import ButtonLink from '@/components/ui/ButtonLink';
import { CARD_SIZES } from '@/components/home/WorksGrid';
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
 * The cards are the grid's own, and so is the grid's rhythm — and their rise as
 * they scroll in (components/layout/QuietMotion). The titles are `h3`s under this
 * section's `h2`, which sits under the work's `h1`.
 *
 * **The way on is the rest of the work's own category**, not the whole gallery:
 * someone looking at a still life who wants more wants more still lifes. When
 * none of the four shares the work's category, that link would lead to a
 * gallery holding nothing but the painting already seen, so it goes to the
 * whole gallery instead.
 *
 * @param {object} props
 * @param {object[]} props.works - From `getMoreWorks`.
 * @param {string} props.category - The current work's category.
 * @param {string} props.locale
 * @param {object} props.dictionary - The public dictionary.
 */

/** The link under the grid, by the current work's category. */
const CATEGORY_LINK_KEY = {
  landscape: 'moreLandscapes',
  'still-life': 'moreStillLifes',
};

export default function MoreWorks({ works, category, locale, dictionary }) {
  if (!works?.length) return null;

  const copy = dictionary.artwork;
  const sharesCategory = works.some((work) => work.category === category) && CATEGORY_LINK_KEY[category];

  return (
    /* A generous gap above: the subject changes from one painting to the body of work. */
    <Section before="generous">
      <Container>
        <SectionHeading>{copy.moreWorksHeading}</SectionHeading>

        <ul className={styles.grid}>
          {works.map((work) => (
            <li key={work.id} className={styles.cell}>
              <ArtworkCard work={work} locale={locale} dictionary={dictionary} sizes={CARD_SIZES} />
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          {sharesCategory ? (
            <ButtonLink href={localeHref(locale, `/gallery?category=${category}`)}>
              {copy[CATEGORY_LINK_KEY[category]]}
            </ButtonLink>
          ) : (
            <ButtonLink href={localeHref(locale, '/gallery')}>{dictionary.home.works.viewAll}</ButtonLink>
          )}
        </div>
      </Container>
    </Section>
  );
}
