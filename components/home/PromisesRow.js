import { Signature, Truck, RotateCcw, MessageCircle } from 'lucide-react';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import styles from './PromisesRow.module.css';

/**
 * The icon for each promise, in the order the locale files list them:
 * original, insured delivery, 14 days to cancel, the artist herself.
 *
 * **The same thin glyphs as the reassurance list on an artwork page**
 * (components/ui/ArtworkAssurances), so a buyer meets each promise in one
 * drawing wherever it is made. The fourth is a speech bubble rather than the
 * WhatsApp mark: it is a promise that she answers, not a control that opens a
 * chat. Reorder the promises in the locale files and this list moves with them.
 */
const ICONS = [Signature, Truck, RotateCcw, MessageCircle];

/**
 * Homepage section 3 — a row of four short promises.
 *
 * The four items come from the dictionary as an array, so a translator can see
 * them together and the count is not baked into the markup.
 *
 * **Their wording matches the artwork page's list**, and "14 days to cancel"
 * deliberately not "to return": the right the law gives is to cancel the
 * transaction, and two words for one promise read as two promises. See
 * commerce.md.
 */
export default function PromisesRow({ dictionary }) {
  const items = dictionary.home.promises.items ?? [];
  if (!items.length) return null;

  return (
    <Section tone="sunk" aria-label={dictionary.home.promises.label}>
      <Container>
        <ul className={styles.row}>
          {items.map((item, index) => {
            const Icon = ICONS[index];

            return (
              <li key={item.title} className={styles.item}>
                {Icon ? (
                  <Icon className={styles.icon} size={20} strokeWidth={1.5} aria-hidden="true" />
                ) : null}
                <h3 className={styles.title}>{item.title}</h3>
                <p className={styles.body}>{item.body}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
