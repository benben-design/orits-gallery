import styles from './Section.module.css';

/**
 * A vertical band of the page. Owns the breathing room between sections so
 * that no individual section component invents its own rhythm.
 *
 * `tone="sunk"` shifts the background one shade back — the only banding the
 * design uses, and still a warm neutral.
 */
export default function Section({
  as: Tag = 'section',
  tone = 'wall',
  size = 'default',
  className = '',
  children,
  ...rest
}) {
  const classes = [styles.section, styles[tone], styles[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
