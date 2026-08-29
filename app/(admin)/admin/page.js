import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';

/**
 * /admin — the dashboard. Scaffolding only.
 *
 * Heading and placeholder copy from the Hebrew dictionary. No auth, no forms,
 * no data writes: this stage of the project has no auth mechanism at all.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.dashboard.title };
}

export default async function AdminDashboardPage() {
  const dictionary = await getDictionary(adminLocale);

  return (
    <StubPage
      title={dictionary.admin.dashboard.title}
      body={dictionary.admin.dashboard.body}
      notice={dictionary.placeholder.notice}
    />
  );
}
