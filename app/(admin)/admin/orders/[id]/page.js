import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';

/**
 * /admin/orders/[id] — scaffolding only.
 *
 * There is no order storage at this stage, so the page simply proves it
 * received its route param.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.order.title };
}

export default async function AdminOrderPage({ params }) {
  const { id } = await params;
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
