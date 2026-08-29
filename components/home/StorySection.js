import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import ButtonLink from '@/components/ui/ButtonLink';
import { localeHref } from '@/lib/i18n/config';
import styles from './StorySection.module.css';

/**
 * Homepage section 4 — a photograph of the artist, a short paragraph, and a
 * link through to the about page.
 *
 * No photograph of Orit has been supplied yet, so the image slot renders a
 * labelled empty frame at the right proportions rather than a stock portrait
 * or a stand-in face. Drop the real photograph in and swap this block for an
 * <Image>; the layout around it does not change.
 */
export default function StorySection({ locale, dictionary }) {
  return (
    <Section>
      <Container>
        <div className={styles.layout}>
          <div className={styles.portrait} role="img" aria-label={dictionary.home.story.portraitPlaceholder}>
            <span className={styles.portraitLabel}>
              {dictionary.home.story.portraitPlaceholder}
            </span>
          </div>

          <div className={styles.text}>
            <h2 className={styles.heading}>{dictionary.home.story.heading}</h2>
            <p className={styles.body}>{dictionary.home.story.body}</p>
            <ButtonLink href={localeHref(locale, '/about')} variant="quiet">
              {dictionary.home.story.link}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
