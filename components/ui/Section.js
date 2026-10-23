import styles from './Section.module.css';

const BEFORE_CLASS = {
  tight: styles.beforeTight,
  standard: styles.beforeStandard,
  generous: styles.beforeGenerous,
};

/**
 * A vertical band of the page. Owns the breathing room between sections so
 * that no individual section component invents its own rhythm.
 *
 * `size` is one of the three rhythm steps — `tight`, `default` (standard) or
 * `generous` — or `snug` / `flush` for a route that is one object. `before`
 * changes only the gap above, for a section that opens a new subject: the
 * homepage's works grid follows the hero with `before="generous"`.
 *
 * `tone="sunk"` shifts the background one shade back — the only banding the
 * design uses, and still a warm neutral.
 */
export default function Section({
  as: Tag = 'section',
  tone = 'wall',
  size = 'default',
  before,
  className = '',
  children,
  ...rest
}) {
  const classes = [styles.section, styles[tone], styles[size], BEFORE_CLASS[before], className]
    .filter(Boolean)
    .join(' ');

  return (
    // `data-reveal` is the hook for the scroll reveal (components/layout/
    // QuietMotion). Empty on the server, so a page with no script is whole.
    <Tag className={classes} data-reveal="" {...rest}>
      {children}
    </Tag>
  );
}
