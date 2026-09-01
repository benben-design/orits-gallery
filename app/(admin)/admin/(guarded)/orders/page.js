import StubPage from '@/components/ui/StubPage';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';

/**
 * /admin/orders — scaffolding only.
 *
 * Heading and placeholder copy from the Hebrew dictionary. No auth, no forms,
 * no data writes.
 *
 * Guarded: without a valid session this redirects to the login page and
 * renders nothing. The path is passed so that signing in comes back here.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.orders.title };
}

export default async function AdminOrdersPage() {
  await requireAdminSession('/admin/orders');

  const dictionary = await getDictionary(adminLocale);

  return (
    <StubPage
      title={dictionary.admin.orders.title}
      body={dictionary.admin.orders.body}
      notice={dictionary.placeholder.notice}
    />
  );
}
