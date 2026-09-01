import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import AdminWorkForm from '@/components/admin/AdminWorkForm';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { createWork } from '@/app/(admin)/admin/actions';
import { WORK_STATUSES, WORK_CATEGORIES } from '@/lib/data/works-repository';
import { WORK_MEDIA, MANUAL_SALE_CHANNELS, AUTOMATIC_SALE_CHANNEL, SOLD_STATUS } from '@/lib/data/work-input';
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
