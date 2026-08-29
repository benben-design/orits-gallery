import { notFound } from 'next/navigation';
import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { getWorkById } from '@/lib/data/works-repository';

/**
 * /admin/works/[id] — scaffolding only.
 *
 * No form and no writes yet, but the lookup is real, and it goes through the
 * repository like everything else. Works are addressed by id here rather than
 * by slug, because a slug is a public, per-language thing and the admin edits
 * the work behind both of them.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.editWork.title };
}

export default async function AdminEditWorkPage({ params }) {
  const { id } = await params;
  const dictionary = await getDictionary(adminLocale);

  const work = await getWorkById(id);
  if (!work) notFound();

  return (
    <StubPage
      title={dictionary.admin.editWork.title}
      body={dictionary.admin.editWork.body}
      notice={dictionary.placeholder.notice}
      details={[
        { label: dictionary.admin.editWork.idLabel, value: work.id },
        { label: dictionary.artwork.title, value: work.title[adminLocale] },
        { label: dictionary.artwork.status, value: dictionary.status[work.status] },
      ]}
    />
  );
}
