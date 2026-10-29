import Container from './Container';
import Section from './Section';
import styles from './FallbackPage.module.css';

/**
 * The body of the two pages nobody meant to reach: not found, and an error
 * while rendering. One heading, one sentence, the ways onward, and nothing else
 * — a visitor who arrived from a link to a painting that has gone needs to see
 * the site is whole and where to go next, not a picture of the problem.
 *
 * Plain markup with no `'use client'` of its own: both callers are client
 * components (`error.js` must be), and it holds no strings — every word arrives
 * from the locale files through them.
 *
 * `actions` is the row of controls; `footnote` an optional quieter line beneath
 * it.
 */
export default function FallbackPage({ title, body, actions, footnote }) {
  return (
    <Section as="div" size="generous" className={styles.section}>
      <Container width="measure" className={styles.inner}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>{actions}</div>
        {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
      </Container>
    </Section>
  );
}
