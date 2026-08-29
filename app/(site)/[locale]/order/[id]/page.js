import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';

/**
 * /order/[id] — the order confirmation page. Scaffolding only.
 *
 * There is no order storage at this stage, so the page just proves it received
 * its route param. Addressed by id because a confirmation is always about one
 * specific order.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return { title: dictionary.orderConfirmation.title };
}

export default async function OrderConfirmationPage({ params }) {
  const { locale, id } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <StubPage
      title={dictionary.orderConfirmation.title}
      body={dictionary.orderConfirmation.body}
      notice={dictionary.placeholder.notice}
      details={[{ label: dictionary.admin.order.idLabel, value: id }]}
    />
  );
}
