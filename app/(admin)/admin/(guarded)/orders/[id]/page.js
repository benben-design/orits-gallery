import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { requireAdminSession } from '@/lib/auth/admin-guard';

/**
 * /admin/orders/[id] — scaffolding only.
 *
 * There is no order storage at this stage, so the page simply proves it
 * received its route param.
 *
 * Guarded: without a valid session this redirects to the login page and
 * renders nothing. The id travels with it, so signing in returns to this order.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.order.title };
}

export default async function AdminOrderPage({ params }) {
  const { id } = await params;
  await requireAdminSession('/admin/orders/' + encodeURIComponent(id));

  const dictionary = await getDictionary(adminLocale);

  return (
    <StubPage
      title={dictionary.admin.order.title}
      body={dictionary.admin.order.body}
      notice={dictionary.placeholder.notice}
      details={[{ label: dictionary.admin.order.idLabel, value: id }]}
    />
  );
}
