import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionLabel from '@/components/ui/SectionLabel';
import ButtonLink from '@/components/ui/ButtonLink';
import PortraitFrame from '@/components/ui/PortraitFrame';
import { localeHref } from '@/lib/i18n/config';
import styles from './StorySection.module.css';

/**
 * Section 4 — the artist: her photograph, a short paragraph, the way to About.
 *
 * **The photograph is a site setting**, uploaded by the artist at
 * `/admin/settings`. It fills its slot in `PortraitFrame` — cropped from the top
 * if it has to be, and deliberately **not** hung on a painting's mat. The
 * never-crop rule is for works for sale; she is not one. See PortraitFrame.
 *
 * **With no photograph there is no frame.** The labelled empty box that stood
 * here while none existed is gone; the section becomes the text alone, and the
 * stylesheet only opens a second column when there is something to put in it.
 * An empty frame on the homepage is the one thing a stranger would read as the
 * site being unfinished.
 *
 * Its alt text is her name. The photograph has not been chosen yet, so nothing
 * more specific can be true of it; the name is.
 */
export default function StorySection({ locale, dictionary, portrait }) {
  return (
    <Section>
      <Container>
        <div className={[styles.layout, portrait ? styles.withPortrait : ''].filter(Boolean).join(' ')}>
          {portrait ? (
            <PortraitFrame
              image={portrait}
              alt={dictionary.site.artistName}
              sizes="(min-width: 48rem) 40vw, 100vw"
            />
          ) : null}

          <div className={styles.text}>
            <div className={styles.titleBlock}>
              <SectionLabel>{dictionary.home.story.label}</SectionLabel>
              <h2 className={styles.heading}>{dictionary.home.story.heading}</h2>
            </div>
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
