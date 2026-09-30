import Link from 'next/link';
import { notFound } from 'next/navigation';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { getWorkById } from '@/lib/data/works-repository';
import { deleteWork, unpublishWork } from '@/app/(admin)/admin/actions';
import styles from './page.module.css';

/**
 * /admin/works/[id]/delete — the question before the deletion.
 *
 * **The confirmation is the feature**, because it is not the same question for
 * both kinds of work:
 *
 *   - A **draft** is hers to discard. Nothing outside the admin has ever seen
 *     it, so the only thing to say is that it goes for good.
 *   - A **published work** has a permanent address that may already be in
 *     somebody's messages or in Google, and deleting it breaks that link
 *     forever. Saying "are you sure?" would be worse than useless there: it
 *     asks her to confirm a consequence nobody has told her about. So the page
 *     names the consequence, and then offers **what she probably meant** —
 *     taking the work off the site, which changes nothing but its visibility
 *     and can be undone by ticking the box again.
 *
 * That last part is why deleting is a choice rather than the only visible exit.
 * A confirmation whose only buttons are "delete" and "cancel" makes deleting
 * the only thing you can *do*, and someone who wants a painting off the site
 * will take it.
 *
 * **One click never deletes.** Getting here is a plain link that changes
 * nothing; the deletion is a form post from this page. Both steps work with no
 * JavaScript, and neither is something a prefetch or a stray click can trigger.
 *
 * Guarded, and guarded before the lookup. **Metadata carries no record data**,
 * because `generateMetadata` runs even when the guard redirects — a title built
 * from the work would tell someone with no session that a painting by that name
 * exists. See security.md.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.deleteWork.title };
}

export default async function AdminDeleteWorkPage({ params, searchParams }) {
  const { id } = await params;
  await requireAdminSession('/admin/works/' + encodeURIComponent(id) + '/delete');

  const query = await searchParams;
  const dictionary = await getDictionary(adminLocale);

  // ADMIN scope: a draft is exactly the kind of work most likely to be deleted.
  const work = await getWorkById(id);
  if (!work) notFound();

  const isPublished = Boolean(work.publishedAt);
  const labels = dictionary.admin.deleteWork;

  /*
    How the last attempt went, carried in the URL rather than through
    `useActionState` — which is what keeps this page a server component. There
    is no typed input to preserve across a failure here, only a code to choose a
    sentence with, and an unknown code is ignored rather than rendered.
  */
  const outcome = typeof query?.outcome === 'string' ? query.outcome : null;
  const message = outcome ? labels.outcomes[outcome] : null;

  return (
    <Section as="div" size="tight">
      <Container width="measure">
        <h1 className={styles.title}>{labels.title}</h1>

        {/*
          Which painting. In the body rather than the heading, where the guard
          has already run.
        */}
        <p className={styles.subject}>{work.title[adminLocale]}</p>

        {message ? (
          <p className={styles.outcome} role="alert">
            {message}
          </p>
        ) : null}

        <p className={styles.warning}>
          {isPublished ? labels.publishedWarning : labels.draftWarning}
        </p>

        {/*
          The safer answer first, and only where it means anything: a draft is
          already off the site, so offering to take it off would be an offer to
          do nothing.
        */}
        {isPublished ? (
          <div className={styles.alternative}>
            <p className={styles.alternativeText}>{labels.unpublishInstead}</p>

            {/*
              Its own form, bound to this work's id. A bound value is not
              tamper-proof — see updateWork in the actions module — which is
              harmless here only because the action checks the session first.
            */}
            <form action={unpublishWork.bind(null, work.id)}>
              <button type="submit" className={styles.keep}>
                {labels.unpublishAction}
              </button>
            </form>
          </div>
        ) : null}

        <div className={styles.decision}>
          <form action={deleteWork.bind(null, work.id)}>
            <button type="submit" className={styles.delete}>
              {labels.deleteAction}
            </button>
          </form>

          <Link className={styles.cancel} href={'/admin/works/' + encodeURIComponent(work.id)}>
            {labels.cancel}
          </Link>
        </div>
      </Container>
    </Section>
  );
}
