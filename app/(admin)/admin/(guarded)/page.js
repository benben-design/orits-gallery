import Link from 'next/link';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import ArtworkFrame from '@/components/ui/ArtworkFrame';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { getWorksForAdmin } from '@/lib/data/works-repository';
import styles from './page.module.css';

/**
 * /admin — every painting she has, and the way back into each one.
 *
 * **This is the list, and the list is the home.** A work could only be opened
 * by typing its id into the URL before this existed: she could create a
 * painting and then have no way back to it. A hub page in front of the list
 * would be a click that buys nothing — there is one thing she does here, and
 * this is it — so signing in lands on the works themselves rather than on a
 * screen with nothing on it.
 *
 * **It reads through the one multi-work lookup that is not public-scoped.**
 * Every other list in the repository filters on publication, which is what
 * keeps a draft off the gallery, the homepage grid and the sitemap by
 * construction rather than by anybody remembering. `getWorksForAdmin` asks for
 * the admin scope explicitly and changes nothing else; the alternative —
 * widening a public read so it could serve this page too — would have published
 * every draft on the site in one line. See data-layer.md.
 *
 * Drafts sort first, because a draft is unfinished business rather than an old
 * record, and on a catalogue of thirty a date ordering puts the one she started
 * this morning wherever its date happens to fall.
 *
 * **This is the first surface allowed to show `saleChannel`.** It is admin-only
 * data — printing it on the public site would turn her sales channels into
 * public information — and the admin is exactly where it belongs, because it is
 * the answer to the question `status` leaves open. See commerce.md.
 *
 * Guarded, and the path is passed so signing in returns here.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.works.title };
}

export default async function AdminWorksPage({ searchParams }) {
  await requireAdminSession('/admin');

  const dictionary = await getDictionary(adminLocale);
  const works = await getWorksForAdmin();

  /*
    What the save that sent her here did, carried in the URL rather than through
    `useActionState` — which is what keeps this page a server component, and the
    only thing that survives the redirect at all. Same shape as the delete
    confirmation. An unknown code renders nothing rather than an empty band.
  */
  const query = await searchParams;
  const saved = typeof query?.saved === 'string' ? query.saved : null;
  const savedMessage = saved ? dictionary.admin.works.outcomes[saved] : null;

  return (
    <Section as="div" size="tight">
      <Container>
        <div className={styles.header}>
          <h1 className={styles.title}>{dictionary.admin.works.title}</h1>
          <Link className={styles.add} href="/admin/works/new">
            {dictionary.admin.newWork.title}
          </Link>
        </div>

        {/*
          The confirmation the form used to show, moved to where the save now
          ends. `role="status"` rather than `alert`: nothing is wrong, and it
          announces without interrupting whatever she does next.
        */}
        {savedMessage ? (
          <p className={styles.saved} role="status">
            {savedMessage}
          </p>
        ) : null}

        {works.length === 0 ? (
          <p className={styles.empty}>{dictionary.admin.works.empty}</p>
        ) : (
          <ul className={styles.list}>
            {works.map((work) => {
              const isDraft = !work.publishedAt;
              const title = work.title[adminLocale];

              /*
                A work has no photograph until one is attached — she enters the
                details and adds the picture later — so this is the normal state
                of a record she has just created, not an error. ArtworkFrame is
                the component that already knows that, and it is the same one
                the gallery card uses: it reserves its box and says which state
                this is, so a row without a picture keeps its shape.
              */
              const image =
                work.images.find((candidate) => candidate.type === 'main') ?? work.images[0];

              const workPath = '/admin/works/' + encodeURIComponent(work.id);

              return (
                /*
                  The row is the list item rather than one big link, because it
                  holds two destinations and an anchor may not contain another.
                */
                <li key={work.id} className={styles.row}>
                  <Link className={styles.open} href={workPath}>
                    <ArtworkFrame
                      image={image}
                      alt={interpolate(dictionary.artwork.imageAlt, {
                        title,
                        artist: dictionary.site.artistName,
                      })}
                      /* Shorter than the public one: this box is four rem wide. */
                      emptyLabel={dictionary.admin.works.noImage}
                      sizes="5rem"
                      className={styles.thumbnail}
                    />

                    <span className={styles.body}>
                      <span className={styles.workTitle}>{title}</span>

                      <span className={styles.states}>
                        {/*
                          Whether it is on the site. Never colour alone: a draft
                          gets a dashed outline and the word, a published work
                          the word on the tint. This is the distinction she is
                          scanning for, so it comes first.
                        */}
                        <span className={isDraft ? styles.draft : styles.live}>
                          {isDraft
                            ? dictionary.admin.works.draft
                            : dictionary.admin.works.published}
                        </span>

                        {/*
                          The sale status, as a word, for all four values.

                          Not StatusBadge: that table decides how a *visitor*
                          reads a state, and two of the four deliberately render
                          nothing there — an available work needs no badge on a
                          card. Here she needs to see which of the four every
                          row is in, including the two the public site says with
                          silence. Different question, different answer; the
                          words are still the same dictionary entries.
                        */}
                        <span className={styles.status}>{dictionary.status[work.status]}</span>

                        {/*
                          Where it sold, when that is recorded — the first
                          surface on this site allowed to say so.

                          Shown whenever the record carries it rather than only
                          when the status is sold. The database deliberately
                          does not tie the two columns, so a work can hold a
                          channel and any status; if that ever happens it is
                          something she should see rather than something this
                          page should quietly hide.
                        */}
                        {work.saleChannel ? (
                          <span className={styles.channel}>
                            {dictionary.admin.works.soldThrough}{' '}
                            {dictionary.saleChannel[work.saleChannel] ?? work.saleChannel}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>

                  {/*
                    A link, not a button. Getting to the question changes
                    nothing, so nothing here can be triggered by a prefetch, a
                    stray click or a scanner — and the deletion itself is a form
                    post from the page it leads to. One click never deletes.
                  */}
                  <Link className={styles.delete} href={workPath + '/delete'}>
                    {dictionary.admin.works.delete}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </Section>
  );
}
