import styles from './SectionLabel.module.css';

/**
 * The small label above a section's title: what kind of thing this is, in a
 * word or two, with a hairline on its start side. The one shared treatment —
 * the homepage sections, the gallery, contact and About all use it, so a label
 * reads as a label wherever it appears.
 *
 * It is a <p>, never a heading: the title below it is the heading, and a
 * label that was one would put two headings where a reader expects one.
 */
export default function SectionLabel({ children, centered = false, className = '' }) {
  return (
    <p className={[styles.label, centered ? styles.centered : '', className].filter(Boolean).join(' ')}>
      {children}
    </p>
  );
}
