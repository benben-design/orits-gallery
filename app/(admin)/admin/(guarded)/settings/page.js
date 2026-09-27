import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import AdminSettingsForm from '@/components/admin/AdminSettingsForm';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { isTranslationConfigured } from '@/lib/translate';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { settingsToFormValues } from '@/lib/data/settings-input';
import {
  saveSettings,
  signPortraitUpload,
  savePortrait,
} from '@/app/(admin)/admin/actions';
import AdminImageUpload from '@/components/admin/AdminImageUpload';
import {
  isImageHostConfigured,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PIXELS,
  MAX_UPLOAD_MEGABYTES,
  MAX_UPLOAD_MEGAPIXELS,
} from '@/lib/image-host';
import styles from './page.module.css';

/**
 * /admin/settings — the studio's own facts: the About text, how to reach her,
 * her social pages, and what delivery costs.
 *
 * One form for all of it rather than a page per field, because they are one
 * kind of thing — she opens this page rarely, changes one or two lines, and
 * saves. The single row it edits is migration 011's.
 *
 * Guarded, and guarded **before** the read, like every page in this group. The
 * save is a Server Action that checks the session itself, because this guard
 * has no say over it. See security.md.
 *
 * Metadata is a fixed dictionary string, never record data, for the reason
 * every admin page's is: `generateMetadata` runs even when the guard redirects.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.settings.title };
}

export default async function AdminSettingsPage({ searchParams }) {
  await requireAdminSession('/admin/settings');

  const dictionary = await getDictionary(adminLocale);
  const copy = dictionary.admin.settings;

  const settings = await getSiteSettings();
  const formValues = settingsToFormValues(settings);

  /*
    The upload panel's wording is the work form's, except where it would be
    wrong: what it is called, what the hint promises, and what "not found" means.
    Composed here rather than duplicated in the locale files, so the dozen
    sentences they share cannot drift apart.
  */
  const imageCopy = dictionary.admin.workForm.image;
  const portraitLabels = {
    ...imageCopy,
    legend: copy.portrait.legend,
    hint: copy.portrait.hint,
    errors: { ...imageCopy.errors, notFound: copy.portrait.notFound },
  };

  /*
    A save lands back here with ?saved=1. A value this page has no sentence for
    renders nothing, the same rule the works list follows for its codes.
  */
  const query = await searchParams;
  const saved = query?.saved === '1';

  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.intro}>{copy.intro}</p>

        {saved ? (
          <p className={styles.saved} role="status">
            {copy.saved}
          </p>
        ) : null}

        {/*
          The portrait, above the form and outside it — the same arrangement as
          a painting's photograph on the edit page, for the same reason: the
          file goes from the browser to the host, and a file input inside the
          form would be serialised into a save capped at 1MB. It saves on its own
          the moment the upload lands. Absent when the host is unconfigured, as
          on the work pages.
        */}
        {isImageHostConfigured() ? (
          <AdminImageUpload
            labels={portraitLabels}
            alt={dictionary.site.artistName}
            initialImage={settings.portrait}
            signAction={signPortraitUpload}
            saveAction={savePortrait}
            maxBytes={MAX_UPLOAD_BYTES}
            maxPixels={MAX_UPLOAD_PIXELS}
            maxMegabytes={MAX_UPLOAD_MEGABYTES}
            maxMegapixels={MAX_UPLOAD_MEGAPIXELS}
          />
        ) : null}

        <AdminSettingsForm
          /*
            Keyed on the values the form itself owns, so a save that changed
            them mounts it afresh from what was stored — including the
            translation state, which lives in the form and would otherwise
            outlast the save that settled it.

            Deliberately **not** keyed on updated_at: a portrait upload bumps
            that and refreshes this page, and a remount then would throw away
            whatever she had typed and not yet saved.
          */
          key={JSON.stringify(formValues)}
          action={saveSettings}
          initialValues={formValues}
          labels={copy.form}
          /*
            The work form's translation strings, reused: the controls are the
            same controls, and they say nothing about paintings.
          */
          translationLabels={dictionary.admin.workForm.translation}
          translationAvailable={isTranslationConfigured()}
        />
      </Container>
    </Section>
  );
}
