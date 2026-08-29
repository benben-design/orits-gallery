import styles from './SectionHeading.module.css';

/**
 * The heading block at the top of a section: an optional small overline, the
 * heading itself, and an optional line of intro prose.
 */
export default function SectionHeading({
  as: Tag = 'h2',
  overline,
  children,
  intro,
  align = 'start',
}) {
  return (
    <header className={[styles.header, styles[align]].filter(Boolean).join(' ')}>
      {overline ? <p className={styles.overline}>{overline}</p> : null}
      <Tag className={styles.heading}>{children}</Tag>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
    </header>
  );
}
