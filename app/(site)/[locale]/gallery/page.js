import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';

/**
 * /gallery — scaffolding only.
 *
 * An identifying heading and placeholder copy, both from the dictionary. No
 * logic, no data access. Replace the StubPage with the real page when it is
 * built; the routing and the shell around it already work in both languages.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return { title: dictionary.gallery.title };
}

export default async function GalleryPage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <StubPage
      title={dictionary.gallery.title}
      body={dictionary.gallery.body}
      notice={dictionary.placeholder.notice}
    />
  );
}
