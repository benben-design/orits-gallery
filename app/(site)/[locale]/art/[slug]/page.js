import { notFound, redirect } from 'next/navigation';
import StubPage from '@/components/ui/StubPage';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { locales, localeHref } from '@/lib/i18n/config';
import {
  getWorkBySlug,
  findWorkByAnySlug,
  getAllWorkSlugs,
} from '@/lib/data/works-repository';

/**
 * A single work, addressed by its slug — scaffolding only.
 *
 * The page body is still a stub, but the *routing* is real, because it is what
 * makes the language switcher work here. Each work has a different slug per
 * language, so switching language on this page produces a URL carrying the
 * other language's slug (e.g. /en/art/לימונים). Rather than teach the
 * switcher about paintings, this route accepts a slug in any language and
 * redirects to the canonical one for the language being viewed.
 */

export async function generateStaticParams() {
  return getAllWorkSlugs(locales);
}

/** A slug from the other language is valid here — it redirects — so allow it. */
export const dynamicParams = true;

/** Resolves the work, redirecting when the slug belongs to another language. */
async function resolveWork(locale, slug) {
  const work = await getWorkBySlug(slug, locale);
  if (work) return work;

  const inAnotherLanguage = await findWorkByAnySlug(slug);
  if (inAnotherLanguage) {
    redirect(localeHref(locale, `/art/${inAnotherLanguage.slug[locale]}`));
  }

  return null;
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const dictionary = await getDictionary(locale);
  const work = await getWorkBySlug(slug, locale);

  return { title: work ? work.title[locale] : dictionary.artwork.title };
}

export default async function ArtworkPage({ params }) {
  const { locale, slug } = await params;
  const dictionary = await getDictionary(locale);

  const work = await resolveWork(locale, slug);
  if (!work) notFound();

  return (
    <StubPage
      title={work.title[locale]}
      body={dictionary.artwork.body}
      notice={dictionary.placeholder.notice}
      details={[
        { label: dictionary.artwork.slugLabel, value: work.slug[locale] },
        { label: dictionary.artwork.category, value: dictionary.category[work.category] },
        { label: dictionary.artwork.status, value: dictionary.status[work.status] },
      ]}
    />
  );
}
