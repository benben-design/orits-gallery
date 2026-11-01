import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import AdminWorkForm, { FORM_ID } from '@/components/admin/AdminWorkForm';
import AdminImageUpload from '@/components/admin/AdminImageUpload';
import AdminAdditionalImages from '@/components/admin/AdminAdditionalImages';
import { interpolate } from '@/lib/i18n/interpolate';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { isTranslationConfigured } from '@/lib/translate';
import { createWork, signMainImageUpload } from '@/app/(admin)/admin/actions';
import {
  isImageHostConfigured,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PIXELS,
  MAX_UPLOAD_MEGABYTES,
  MAX_UPLOAD_MEGAPIXELS,
  ALLOWED_UPLOAD_FORMATS,
} from '@/lib/image-host';
import { WORK_STATUSES, WORK_CATEGORIES } from '@/lib/data/works-repository';
import {
  WORK_MEDIA,
  MANUAL_SALE_CHANNELS,
  AUTOMATIC_SALE_CHANNEL,
  SOLD_STATUS,
  IMAGE_PUBLIC_ID_FIELD,
} from '@/lib/data/work-input';
import styles from './page.module.css';

/**
 * /admin/works/new — adding a painting.
 *
 * Guarded: without a valid session this redirects to the login page and renders
 * nothing. The guard covers this page; it does **not** cover the action the
 * form posts to, which checks the session itself. See security.md.
 *
 * Every closed set is built here from the exported constants and translated
 * through the dictionary, so the option lists cannot drift from what the
 * database will accept and no Hebrew label lives in a component.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.newWork.title };
}

/** Turns a set of keys into labelled options, in the order the constant declares. */
function toOptions(values, translations) {
  return values.map((value) => ({ value, label: translations[value] ?? value }));
}

export default async function AdminNewWorkPage() {
  await requireAdminSession('/admin/works/new');

  const dictionary = await getDictionary(adminLocale);

  /**
   * Today's date, resolved on the server and passed down as a string.
   *
   * Never `new Date()` inside the form: a date computed during render differs
   * between server and browser and causes a hydration mismatch — the rule in
   * frontend/next.md that SiteFooter follows for the copyright year.
   */
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{dictionary.admin.newWork.title}</h1>

        <AdminWorkForm
          mode="create"
          action={createWork}
          today={today}
          /*
            Whether the English fields fill themselves in from the Hebrew. The
            key lives on the server and is never sent here — only the answer to
            whether there is one. Without it the form is exactly what it was
            before translation existed rather than one that fails at every
            field. See lib/translate.js.
          */
          translationAvailable={isTranslationConfigured()}
          imagePanel={
            isImageHostConfigured() ? (
            <>
              <AdminImageUpload
                labels={dictionary.admin.workForm.image}
                /*
                  The work has no title yet, so the alt text a saved work would
                  derive cannot be built. This describes what the frame holds:
                  a photograph she is attaching, on a page nobody else sees.
                */
                alt={interpolate(dictionary.artwork.imageAlt, {
                  title: dictionary.admin.newWork.title,
                  artist: dictionary.site.artistName,
                })}
                signAction={signMainImageUpload}
                /*
                  No saveAction, and that absence is the whole difference: a
                  work has no id until this form is saved, so the upload waits
                  in the field below and is written with the record. The panel
                  says so rather than claiming the photograph is stored.
                */
                fieldName={IMAGE_PUBLIC_ID_FIELD}
                formId={FORM_ID}
                maxBytes={MAX_UPLOAD_BYTES}
                maxPixels={MAX_UPLOAD_PIXELS}
                maxMegabytes={MAX_UPLOAD_MEGABYTES}
                maxMegapixels={MAX_UPLOAD_MEGAPIXELS}
                allowedFormats={ALLOWED_UPLOAD_FORMATS}
              />
              <AdminAdditionalImages
                labels={dictionary.admin.workForm.additionalImages}
                uploadLabels={dictionary.admin.workForm.image}
                alt={interpolate(dictionary.artwork.imageAltAdditional, {
                  title: dictionary.admin.newWork.title,
                  artist: dictionary.site.artistName,
                })}
                signAction={signMainImageUpload}
                formId={FORM_ID}
                maxBytes={MAX_UPLOAD_BYTES}
                maxPixels={MAX_UPLOAD_PIXELS}
                maxMegabytes={MAX_UPLOAD_MEGABYTES}
                maxMegapixels={MAX_UPLOAD_MEGAPIXELS}
                allowedFormats={ALLOWED_UPLOAD_FORMATS}
              />
            </>
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
