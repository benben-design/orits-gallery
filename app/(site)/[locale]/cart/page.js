import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';

/**
 * /cart — scaffolding only.
 *
 * An identifying heading and placeholder copy, both from the dictionary. No
 * logic, no data access. Replace the StubPage with the real page when it is
 * built; the routing and the shell around it already work in both languages.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return { title: dictionary.cart.title };
}

export default async function CartPage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <StubPage
      title={dictionary.cart.title}
      body={dictionary.cart.body}
      notice={dictionary.placeholder.notice}
    />
  );
}
