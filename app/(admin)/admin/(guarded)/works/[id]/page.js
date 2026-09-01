import { notFound } from 'next/navigation';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import AdminWorkForm from '@/components/admin/AdminWorkForm';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { updateWork } from '@/app/(admin)/admin/actions';
import { getWorkById, WORK_STATUSES, WORK_CATEGORIES } from '@/lib/data/works-repository';
import { WORK_MEDIA, MANUAL_SALE_CHANNELS, AUTOMATIC_SALE_CHANNEL, SOLD_STATUS, workToFormValues } from '@/lib/data/work-input';
import styles from './page.module.css';

/**
 * /admin/works/[id] — editing a painting.
 *
 * Guarded, and guarded **before the lookup**: reading the work first would query
 * the database for someone with no session, and would let a redirect and a 404
 * be told apart, which answers whether a given id exists.
 *
 * Works are addressed by id here rather than by slug, because a slug is a
 * public, per-language thing and the admin edits the work behind both of them.
 *
 * The form is the same component the new-work page uses. It receives the action
 * as a prop, so one form serves both pages and neither can drift from the
 * other. The action is bound to this work's id server-side — Next signs bound
 * arguments, so the browser cannot point the save at a different work.
 *
 * **Metadata carries no record data**, deliberately. `generateMetadata` runs
 * even when the guard redirects, so a title built from the work would tell
 * someone with no session that a painting by that name exists. See security.md.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.editWork.title };
}

/** Turns a set of keys into labelled options, in the order the constant declares. */
function toOptions(values, translations) {
  return values.map((value) => ({ value, label: translations[value] ?? value }));
}

export default async function AdminEditWorkPage({ params }) {
  const { id } = await params;
  await requireAdminSession('/admin/works/' + encodeURIComponent(id));

  const dictionary = await getDictionary(adminLocale);

  // ADMIN scope: this is the one read that sees drafts, because the admin has
  // to be able to open a work it has not published.
  const work = await getWorkById(id);
  if (!work) notFound();

  const isPublished = Boolean(work.publishedAt);

  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{dictionary.admin.editWork.title}</h1>

        {/*
          Which painting this is. The heading is a fixed dictionary string —
          admin titles must not be built from record data — so the work names
          itself here, in the body, where the guard has already run.
        */}
        <p className={styles.subject}>{work.title[adminLocale]}</p>

        <AdminWorkForm
          mode="edit"
          action={updateWork.bind(null, work.id)}
          initialValues={workToFormValues(work)}
          slugsLocked={isPublished}
          today={work.addedAt}
          labels={dictionary.admin.workForm}
          options={{
            categories: toOptions(WORK_CATEGORIES, dictionary.category),
            statuses: toOptions(WORK_STATUSES, dictionary.status),
            media: toOptions(WORK_MEDIA, dictionary.medium),
            /*
              Only the channels she picks by hand, in the order she picks them.
              "this-site" is written by checkout and is deliberately not offered
              here; the form shows it as a fact when a work already carries it.
            */
            manualSaleChannels: toOptions(MANUAL_SALE_CHANNELS, dictionary.saleChannel),

            /*
              Passed rather than imported by the form: work-input.js reaches
              lib/data/artworks.js, and importing that into a client component
              would ship the whole seed fixture to the browser.
            */
            soldStatus: SOLD_STATUS,
            automaticSaleChannel: AUTOMATIC_SALE_CHANNEL,
          }}
        />
      </Container>
    </Section>
  );
}
