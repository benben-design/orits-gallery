import SectionLabel from './SectionLabel';
import styles from './SectionHeading.module.css';

/**
 * The heading block at the top of a section: an optional label, the heading
 * itself, and an optional line of intro prose.
 *
 * As an `h1` it is a page title and keeps the page-title step; as anything
 * else it is a section heading and takes the larger --text-section. The two
 * were one size until the reading scale was raised, and a page title must not
 * grow because section headings did.
 */
export default function SectionHeading({
  as: Tag = 'h2',
  label,
  children,
  intro,
  align = 'start',
}) {
  return (
    <header className={[styles.header, styles[align]].filter(Boolean).join(' ')}>
      {label ? <SectionLabel centered={align === 'center'}>{label}</SectionLabel> : null}
      <Tag className={Tag === 'h1' ? styles.pageTitle : styles.heading}>{children}</Tag>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
    </header>
  );
}
