import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import styles from './PromisesRow.module.css';

/**
 * Homepage section 3 — a row of four short promises.
 *
 * The four items come from the dictionary as an array, so a translator can see
 * them together and the count is not baked into the markup.
 */
export default function PromisesRow({ dictionary }) {
  const items = dictionary.home.promises.items ?? [];
  if (!items.length) return null;

  return (
    <Section tone="sunk" size="tight" aria-label={dictionary.home.promises.label}>
      <Container>
        <ul className={styles.row}>
          {items.map((item) => (
            <li key={item.title} className={styles.item}>
              <h3 className={styles.title}>{item.title}</h3>
              <p className={styles.body}>{item.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
