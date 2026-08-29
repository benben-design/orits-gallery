import styles from './Container.module.css';

/**
 * Horizontal page frame: max width plus gutters. Nothing else.
 *
 * `width="measure"` narrows to a comfortable reading column for running prose.
 */
export default function Container({
  as: Tag = 'div',
  width = 'default',
  className = '',
  children,
  ...rest
}) {
  const classes = [styles.container, styles[width], className].filter(Boolean).join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
