import Link from 'next/link';
import { notFound } from 'next/navigation';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import AdminWorkForm from '@/components/admin/AdminWorkForm';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { isTranslationConfigured } from '@/lib/translate';
import {
  isImageHostConfigured,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PIXELS,
  MAX_UPLOAD_MEGABYTES,
  MAX_UPLOAD_MEGAPIXELS,
} from '@/lib/image-host';
import AdminImageUpload from '@/components/admin/AdminImageUpload';
import { interpolate } from '@/lib/i18n/interpolate';
import {
  updateWork,
  signMainImageUpload,
  saveMainImage,
} from '@/app/(admin)/admin/actions';
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

  /**
   * The main image, and the panel that replaces the notice.
   *
   * Offered here and not on the new-work page: an upload has to be recorded
   * against a work, and a work has no id until it is first saved. That is the
   * order she already works in, and it is what the notice on that page says.
   *
   * Absent when the host is not configured, in the same shape translation is:
   * the notice comes back and nothing else changes. An install with no
   * credentials should look like the admin did before this existed, not like a
   * broken one.
   *
   * The save action is **bound to this work's id server-side**. Next signs
   * bound arguments, so a finished upload cannot be repointed at a different
   * painting from the browser. Signing takes no id at all — nothing about the
   * signature names a work. See the actions module.
   */
  const mainImage = work.images.find((image) => image.type === 'main') ?? null;

  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{dictionary.admin.editWork.title}</h1>

        {/*
          Which painting this is. The heading is a fixed dictionary string —
          admin titles must not be built from record data — so the work names
          itself here, in the body, where the guard has already run.
        */}
        <p className={styles.subject}>
          {work.title[adminLocale]}
          {/*
            The way to look at the work before anyone else can. It matters most
            on a draft, whose public address does not resolve yet and whose slug
            becomes permanent the moment she ticks publish — but it is offered
            on both, because "what does this look like" is the same question
            either way and a link that appears and disappears is one she has to
            think about.
          */}
          <Link
            className={styles.preview}
            href={'/admin/works/' + encodeURIComponent(work.id) + '/preview'}
          >
            {dictionary.admin.editWork.preview}
          </Link>
        </p>

        <AdminWorkForm
          mode="edit"
          action={updateWork.bind(null, work.id)}
          initialValues={workToFormValues(work)}
          slugsLocked={isPublished}
          today={work.addedAt}
          /*
            Same flag as the new-work page. On an existing work nothing is
            translated on load and nothing is pending: the English it already
            carries was approved when it was saved. See lib/translate.js.
          */
          translationAvailable={isTranslationConfigured()}
          imagePanel={
            isImageHostConfigured() ? (
              <AdminImageUpload
                labels={dictionary.admin.workForm.image}
                /*
                  The same alt text every other surface derives, because
                  work_images.alt_he / alt_en are not read yet and absent means
                  "derive it from the title". See images.md.
                */
                alt={interpolate(dictionary.artwork.imageAlt, {
                  title: work.title[adminLocale],
                  artist: dictionary.site.artistName,
                })}
                initialImage={mainImage}
                signAction={signMainImageUpload}
                saveAction={saveMainImage.bind(null, work.id)}
                /*
                  Numbers rather than an import: lib/image-host.js reads
                  node:crypto, so a client component cannot import it. Same
                  reason the closed sets below are passed rather than imported.
                */
                maxBytes={MAX_UPLOAD_BYTES}
                maxPixels={MAX_UPLOAD_PIXELS}
                maxMegabytes={MAX_UPLOAD_MEGABYTES}
                maxMegapixels={MAX_UPLOAD_MEGAPIXELS}
              />
            ) : null
          }
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
            /*
              Its wording, so the form can show the channel as a checked,
              unchangeable choice rather than as a sentence where the
              options would be. Same dictionary the other three read.
            */
            automaticSaleChannelLabel: dictionary.saleChannel[AUTOMATIC_SALE_CHANNEL],
          }}
        />
      </Container>
    </Section>
  );
}
