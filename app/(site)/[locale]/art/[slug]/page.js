import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import ArtworkDetail from '@/components/ui/ArtworkDetail';
import MoreWorks from '@/components/artwork/MoreWorks';
import BuyBar from '@/components/artwork/BuyBar';
import { isBuyable } from '@/components/ui/statusPresentation';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { locales, defaultLocale, localeHref, getLocaleTag } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { absoluteUrl } from '@/lib/site-url';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { shareImageFor } from '@/lib/image-loader';
import {
  getWorkBySlug,
  findWorkByAnySlug,
  getAllWorkSlugs,
  getSlugsForWork,
  getMoreWorks,
} from '@/lib/data/works-repository';
import styles from './page.module.css';

/**
 * /[locale]/art/[slug] — one painting, as a visitor sees it.
 *
 * **The page the project is shaped around.** With about thirty works, depth per
 * painting is what makes this a body of work rather than an inventory.
 *
 * The body lives in `components/ui/ArtworkDetail.js` because **two routes
 * render it**: this one, and the admin's preview at `/admin/works/[id]/preview`.
 * The difference between them is one thing and one thing only — **the scope the
 * work was read in.** This route reads published works; the preview reads
 * through the admin-scoped lookup that can see a draft. Keeping the body in one
 * component is what makes the preview an answer to "what will a visitor see"
 * rather than a second design that drifts.
 *
 * That split is also the security boundary, and it is worth being precise about
 * where it lives: **it is not in this file, and not in the preview's either.**
 * `getWorkBySlug` and `findWorkByAnySlug` are public-scoped inside the
 * repository, so a draft cannot be reached here by guessing a URL even if
 * someone forgot to think about it. See data-layer.md.
 *
 * The routing was real before the body was: each work has a different slug per
 * language, so switching language here produces a URL carrying the other
 * language's slug. Rather than teach the switcher about paintings, this route
 * accepts a slug in any language and redirects to the canonical one.
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

/** Where a search result stops reading, so this is where the sentence ends. */
const DESCRIPTION_LIMIT = 160;

/** Runs of whitespace, including the paragraph breaks, become single spaces. */
function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Cut at a word where there is one near the end, rather than mid-word. */
function truncate(text, limit) {
  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');

  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/**
 * The sentence under the link, in a search result and in a chat preview.
 *
 * Her own words when they are hers. Every seeded record carries a bracketed
 * `[PLACEHOLDER]` description, and `hasPlaceholderData` is what tells the two
 * apart — `work-input.js` clears it on anything she enters herself. The
 * stand-ins are deliberately visible so they cannot ship unnoticed, and they
 * stay visible **on the page**; a share preview is the one surface where
 * publishing one would do damage rather than good, because it is what a
 * stranger sees before deciding whether to open the link at all.
 *
 * The fallback is true of every painting here whatever has been written about
 * it, which is the property that matters: it can never say something the record
 * does not support.
 */
function shareDescription(work, locale, dictionary) {
  const written = work.description[locale];

  if (written && !work.hasPlaceholderData) {
    return truncate(collapse(written), DESCRIPTION_LIMIT);
  }

  return interpolate(dictionary.artwork.shareDescription, {
    title: work.title[locale],
    artist: dictionary.site.artistName,
  });
}

/**
 * The painting, as the picture on the shared link.
 *
 * **The edge this sits on, and what was chosen.** Platforms want a wide card —
 * about 1200x630 — and these paintings run from 0.62 to 1.51, so no single file
 * satisfies both that and the rule that a painting is never cropped.
 *
 * The choice is to hand over **the painting itself, whole** — scaled to at most
 * 1200 wide as a JPEG by the host, never cropped — and let each platform frame
 * it however it frames things. The
 * alternative was to generate a 1200x630 card with the work letterboxed on the
 * wall colour, and it was rejected twice over: most of that image would be
 * empty mat, and the platforms with a squarer preview would crop *it* — so the
 * painting ends up smaller and still cropped, in exchange for a build-time
 * image pipeline that does not exist yet.
 *
 * The rule this respects is the one images.md actually states: **we** never
 * crop a work. What Facebook does inside its own card is not a decision this
 * repository gets to make, and pretending otherwise costs resolution. If real
 * previews ever look wrong once the proper photography lands, a generated
 * letterboxed card is the thing to build, and this is the note that says so.
 *
 * Width and height are declared so a platform knows the shape before it fetches
 * the file, and they are the served file's, not the original's. A work with no photograph yet returns null and the page ships no
 * image at all rather than a stand-in nobody chose.
 */
function shareImage(work, locale, dictionary) {
  const image = work.images.find((candidate) => candidate.type === 'main') ?? work.images[0];
  if (!image) return null;

  /*
    Through the host, as a JPEG at most 1200 wide, rather than the stored
    original: an original can be 10MB, which WhatsApp will not preview, or HEIC,
    which no crawler reads. The dimensions are the served file's. See
    shareImageFor in lib/image-loader.js.
  */
  const served = shareImageFor(image);

  return {
    url: absoluteUrl(served.src),
    width: served.width,
    height: served.height,
    alt: interpolate(dictionary.artwork.imageAlt, {
      title: work.title[locale],
      artist: dictionary.site.artistName,
    }),
  };
}

/**
 * What a search engine and a shared link see.
 *
 * This address is permanent once published — seo.md — so it is worth getting
 * right once: the work and the artist in the title, her own sentence under it,
 * the canonical URL, both languages declared as each other's alternate, and the
 * painting as the picture.
 *
 * **It runs even when the page is about to 404.** Next calls `generateMetadata`
 * separately from the component, so neither the `notFound()` below nor the
 * cross-language redirect stops it. An unresolvable slug — a typo, or a draft
 * whose URL someone guessed — must therefore be answered without asserting that
 * a work by that name exists. The admin pages hold the same shape for a
 * different reason: see security.md.
 */
export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const dictionary = await getDictionary(locale);
  const work = await getWorkBySlug(slug, locale);

  // Nothing published answers to this slug. A generic title, no canonical, no
  // alternates and no picture: the page is a 404 and says nothing about what
  // might have been here.
  if (!work) return { title: dictionary.artwork.title };

  const title = work.title[locale];

  /*
    The published slug pair, read through the repository rather than assembled
    from the record already in hand. Both come from the same row today, but this
    lookup is public-scoped in its own right, so an hreflang pair cannot name a
    draft — which matters more now that an admin-scoped read of this same work
    exists one route away. A wrong hreflang is worse than none: seo.md.
  */
  const slugs = (await getSlugsForWork(work.id)) ?? work.slug;

  const urlFor = (which) => absoluteUrl(localeHref(which, `/art/${slugs[which]}`));
  const canonical = urlFor(locale);

  /*
    Every language declares every language, itself included, which is what makes
    the pair reciprocal. `x-default` points at the default locale because that
    is what the bare root redirects to.
  */
  const languages = Object.fromEntries(
    locales.map((other) => [getLocaleTag(other), urlFor(other)])
  );
  languages['x-default'] = urlFor(defaultLocale);

  const description = shareDescription(work, locale, dictionary);
  const image = shareImage(work, locale, dictionary);

  /* The layout's title template appends the artist, so "Lemons" arrives as
     "Lemons - Orit Bar Shai". Open Graph has no template, so it is spelled out. */
  const sharedTitle = `${title} - ${dictionary.site.artistName}`;

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: sharedTitle,
      description,
      url: canonical,
      siteName: dictionary.site.title,
      locale: getLocaleTag(locale),
      images: image ? [image] : undefined,
    },
    twitter: {
      /* Without a photograph there is nothing to make large. */
      card: image ? 'summary_large_image' : 'summary',
      title: sharedTitle,
      description,
      images: image ? [image.url] : undefined,
    },
  };
}

export default async function ArtworkPage({ params }) {
  const { locale, slug } = await params;
  const dictionary = await getDictionary(locale);

  // Public-scoped, so a draft is not reachable by guessing its URL — the filter
  // lives in the repository rather than being remembered here. See data-layer.md.
  const work = await resolveWork(locale, slug);
  if (!work) notFound();

  /*
    The delivery rate, whether pickup is offered and the WhatsApp number, for
    the lines above the buy controls. The page is prerendered, and saving the
    settings already clears every public page (lib/revalidate.js), so this
    costs a visitor nothing.

    And the other works shown at the foot of the page — from the catalogue the
    gallery already caches, so every painting's page shares one read of it
    rather than each making its own.
  */
  const [settings, moreWorks] = await Promise.all([getSiteSettings(), getMoreWorks(work)]);

  return (
    <>
      {/*
        `snug` rather than the default section rhythm. The default 104px belongs
        to a page of stacked sections that need separating from one another; this
        route is a single object and its own top gap is the only thing between the
        navigation and the painting. At the default the work was pushed against
        the bottom of a laptop screen and the page had to be scrolled to see a
        painting that otherwise fits — 64px fixed that, and 32px is where it was
        settled by eye.
      */}
      <Section size="snug">
        <Container>
          {/*
            The way back, and the only thing on this page that is navigation
            rather than the work.

            It lives here rather than in `ArtworkDetail` on purpose. That
            component is rendered by the admin's preview too, where these links
            would lead out of the admin and where the surrounding chrome is
            deliberately the admin's own — so the breadcrumb belongs to the public
            route, exactly as the header and the footer do.

            An ordered list because the steps are a sequence, and the current page
            is text rather than a link to itself.
          */}
          <nav aria-label={dictionary.artwork.breadcrumb} className={styles.breadcrumb}>
            <ol className={styles.crumbs}>
              <li>
                <Link href={localeHref(locale, '/')}>{dictionary.nav.home}</Link>
              </li>
              <li>
                <Link href={localeHref(locale, '/gallery')}>{dictionary.nav.gallery}</Link>
              </li>
              <li aria-current="page" className={styles.current}>
                {work.title[locale]}
              </li>
            </ol>
          </nav>

          <ArtworkDetail work={work} locale={locale} dictionary={dictionary} settings={settings} />
        </Container>
      </Section>

      {/*
        Here rather than in ArtworkDetail, so the admin preview — which renders
        that body — cannot grow it. See components/artwork/MoreWorks.js.
      */}
      <MoreWorks works={moreWorks} category={work.category} locale={locale} dictionary={dictionary} />

      {/*
        The phone's buy bar, for a work that can be bought and on this route
        only — the admin preview renders the body above, never this. Handed the
        two dictionary slices Price reads rather than the whole dictionary,
        which would be serialised into every artwork page for one bar.
      */}
      {isBuyable(work.status) ? (
        <BuyBar
          work={{
            id: work.id,
            title: work.title[locale],
            price: work.price,
            status: work.status,
            isPlaceholder: work.hasPlaceholderData,
          }}
          locale={locale}
          priceCopy={{ price: dictionary.price, status: dictionary.status }}
          copy={{ addToCart: dictionary.artwork.addToCart, backToPainting: dictionary.artwork.backToPainting }}
        />
      ) : null}
    </>
  );
}
