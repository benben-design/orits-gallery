import Link from 'next/link';
import { notFound } from 'next/navigation';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import ArtworkDetail from '@/components/ui/ArtworkDetail';
import { getDictionary } from '@/lib/i18n/dictionaries';
import {
  adminLocale,
  locales,
  localeNames,
  localeHref,
  isLocale,
  getDirection,
  getLocaleTag,
} from '@/lib/i18n/config';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { getWorkById } from '@/lib/data/works-repository';
import styles from './page.module.css';

/**
 * /admin/works/[id]/preview — a painting's page before anybody else can see it.
 *
 * She fills the form, ticks publish, and the work is live having never been
 * looked at — and the address is permanent from that moment. This is the page
 * that closes that gap.
 *
 * **The read scope is the whole feature.** This renders exactly the same body
 * component as `/[locale]/art/[slug]`; the only difference between the two
 * routes is that this one reads through `getWorkById`, the single admin-scoped
 * lookup, which is what makes a draft visible at all. Every public read stays
 * published-only, so a visitor still cannot reach a draft by guessing a URL —
 * that filter lives inside the repository rather than in anyone's memory. See
 * data-layer.md.
 *
 * **Why it lives under `/admin` rather than as a flag on the public route.**
 * The session cookie is scoped to `/admin`, so a preview at
 * `/he/art/<slug>?preview=1` would never receive it and could not verify a
 * session however carefully it tried. That is not a detail to work around: it
 * is the reason admin surfaces live under `/admin`. See security.md.
 *
 * **It verifies the session itself**, in its first statement, like every other
 * page in this group — and being inside `(guarded)/` is what makes
 * `scripts/check-admin-guard.mjs` insist on it rather than trusting that
 * somebody remembered.
 *
 * **Metadata carries no record data.** `generateMetadata` runs even when the
 * guard redirects, so a title built from the work would tell someone with no
 * session that a painting by that name exists. The work names itself in the
 * body, after the guard. See security.md.
 *
 * What it deliberately does *not* reproduce is the public chrome: this sits
 * inside the admin shell, so the site header and footer are not around it. The
 * body is the part she wrote and the part she can get wrong, and it is pixel
 * for pixel the component a visitor gets.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.preview.title };
}

export default async function AdminWorkPreviewPage({ params, searchParams }) {
  const { id } = await params;
  await requireAdminSession('/admin/works/' + encodeURIComponent(id) + '/preview');

  const query = await searchParams;

  /*
    Which language to look at. She approves the English in the form, so being
    able to see the English page is half the point of previewing at all.

    An unknown value falls back to the admin's own language rather than
    erroring — the same treatment the gallery gives an unknown category, and for
    the same reason: it arrives from a URL anyone can hand-edit.
  */
  const requested = typeof query?.locale === 'string' ? query.locale : null;
  const previewLocale = isLocale(requested) ? requested : adminLocale;

  const adminDictionary = await getDictionary(adminLocale);

  // ADMIN scope, and the only reason this page exists: the one read that sees a
  // work the public site is not showing.
  const work = await getWorkById(id);
  if (!work) notFound();

  const isPublished = Boolean(work.publishedAt);

  /* The body reads the public dictionary, because it is the public page. */
  const publicDictionary = await getDictionary(previewLocale);

  const previewHref = (which) =>
    '/admin/works/' + encodeURIComponent(id) + '/preview?locale=' + which;

  return (
    <Section as="div" size="tight">
      <Container>
        {/*
          The band that stops her believing this is live.

          Dashed and worded, never colour alone, like every other state on this
          site. It says which of the two situations she is in, because "preview"
          on its own does not answer the question she actually has — is this
          visible to anyone yet — and a draft that reads as published is exactly
          the misunderstanding this page was built to prevent.
        */}
        <div className={isPublished ? styles.bannerLive : styles.banner} role="status">
          <p className={styles.bannerText}>
            {isPublished
              ? adminDictionary.admin.preview.published
              : adminDictionary.admin.preview.draft}
          </p>

          <div className={styles.bannerActions}>
            {/*
              The languages, as links rather than a switcher component: this is
              a server component and the choice is a URL, which also means she
              can send herself the English one.
            */}
            <nav className={styles.languages} aria-label={adminDictionary.admin.preview.languageLabel}>
              {locales.map((which) => (
                <Link
                  key={which}
                  href={previewHref(which)}
                  className={
                    which === previewLocale
                      ? styles.language + ' ' + styles.languageActive
                      : styles.language
                  }
                  aria-current={which === previewLocale ? 'true' : undefined}
                >
                  {localeNames[which]}
                </Link>
              ))}
            </nav>

            <Link className={styles.action} href={'/admin/works/' + encodeURIComponent(id)}>
              {adminDictionary.admin.preview.backToEdit}
            </Link>

            {/*
              Only once it is public is there a public address to send her to.
              Offering it on a draft would be offering a link that 404s.
            */}
            {isPublished ? (
              <Link
                className={styles.action}
                href={localeHref(previewLocale, `/art/${work.slug[previewLocale]}`)}
              >
                {adminDictionary.admin.preview.viewOnSite}
              </Link>
            ) : null}
          </div>
        </div>

        {/*
          `dir` and `lang` on the preview frame, which is the one place on this
          project they are set anywhere but the <html> element — and the
          exception i18n.md's rule is aimed at is the opposite case, an inner
          element patching a broken layout. This is a fragment genuinely in
          another language inside a Hebrew document, which is what these
          attributes are for. Direction resolves per element, so every logical
          property in the body below lays out exactly as it will on the site.
        */}
        <div
          className={styles.frame}
          dir={getDirection(previewLocale)}
          lang={getLocaleTag(previewLocale)}
        >
          <ArtworkDetail
            work={work}
            locale={previewLocale}
            dictionary={publicDictionary}
          />
        </div>
      </Container>
    </Section>
  );
}
