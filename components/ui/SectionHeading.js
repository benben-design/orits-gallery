import styles from './SectionHeading.module.css';

/**
 * The heading block at the top of a section: the heading itself, and an
 * optional line of intro prose.
 *
 * **No label above it** (removed 25-10-2026). A small tracked word with a
 * hairline over every heading read as template chrome; the heading stands on
 * its own. The about page keeps one above the artist's name, through
 * SectionLabel directly, because there the name alone would not say what the
 * page is.
 *
 * As an `h1` it is a page title and keeps the page-title step; as anything
 * else it is a section heading and takes the larger --text-section. The two
 * were one size until the reading scale was raised, and a page title must not
 * grow because section headings did.
 */
export default function SectionHeading({
  as: Tag = 'h2',
  children,
  intro,
  align = 'start',
}) {
  return (
    <header className={[styles.header, styles[align]].filter(Boolean).join(' ')}>
      <Tag className={Tag === 'h1' ? styles.pageTitle : styles.heading}>{children}</Tag>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
    </header>
  );
}
