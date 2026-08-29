import Container from './Container';
import Section from './Section';
import styles from './StubPage.module.css';

/**
 * The shared body of every page that is scaffolding rather than a built page:
 * an identifying heading, placeholder prose, and an unmissable band saying the
 * page is not real yet.
 *
 * `details` renders a small definition list, used where a stub still needs to
 * prove it received its route params (the artwork slug, an order id).
 *
 * All copy is passed in from the caller's dictionary — this component holds no
 * strings of its own.
 */
export default function StubPage({ title, body, notice, details }) {
  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>

        {details?.length ? (
          <dl className={styles.details}>
            {details.map((detail) => (
              <div key={detail.label} className={styles.detailRow}>
                <dt className={styles.detailLabel}>{detail.label}</dt>
                <dd className={styles.detailValue}>{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {notice ? <p className={styles.notice}>{notice}</p> : null}
      </Container>
    </Section>
  );
}
