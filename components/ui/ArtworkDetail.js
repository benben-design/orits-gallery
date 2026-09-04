import ArtworkFrame from './ArtworkFrame';
import StatusBadge from './StatusBadge';
import Price from './Price';
import AddToCart from '@/components/cart/AddToCart';
import { getStatusPresentation } from './statusPresentation';
import { mediumLabel } from './mediumLabel';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatDimensions } from '@/lib/format';
import styles from './ArtworkDetail.module.css';

/**
 * One painting, large, beside its details — the whole body of an artwork page.
 *
 * **It is a component rather than page markup because two routes render it, and
 * the point is that they render the same thing.** The public page reads a
 * published work; the admin's preview reads a draft through the one repository
 * function that sees them. If the preview were its own layout it would answer a
 * different question from the one she is asking, which is *what will a visitor
 * see* — so there is one body here and the two callers differ only in what they
 * hand it and what they wrap around it.
 *
 * It builds nothing that already exists. The frame that never crops, the price,
 * the badge and the status table are the components the grid uses, so a work
 * cannot read "sold" one way here and another way on the gallery.
 *
 * The one deliberate difference from the grid is the mount: `ArtworkFrame`'s
 * `bare` tone, whose only caller this is. A single large work hangs straight on
 * the wall, where a mount would read as a card and a card reads as commerce.
 * The supporting images below keep the surface mount, because several small
 * works warm-on-warm each need their own edge. Both halves are in images.md.
 *
 * **The buy button is here now**, and `AddToCart` decides for itself whether to
 * draw one. That is what keeps this component honest across its two callers:
 * the preview renders a *draft* through an admin-scoped read, and a draft is
 * not for sale at any status, so the control removes itself rather than the
 * page having to know which route it is on. A published work previews with the
 * button, because that is what a visitor will see.
 *
 * It sits below the placeholder notice on purpose. The notice disclaims the
 * price directly above it, and a call to action reading past a disclaimer it
 * has not met yet is how a stand-in figure gets treated as real.
 *
 * Two things this must never do:
 *
 *   - **Render `saleChannel`.** It rides along on the work object because the
 *     admin needs it, and printing it here would turn the artist's sales
 *     channels into public information. This is where that happens by accident.
 *   - **State a placeholder as fact.** Every seeded record carries an absurd
 *     size, year and price on purpose. `Price` marks its own; the note below
 *     covers the rest.
 *
 * It renders the `<h1>`, because on both pages the work's title is the heading
 * of the thing being looked at. A caller must not add a second one.
 *
 * @param {object} props
 * @param {object} props.work - A work as the repository returns it, from either scope.
 * @param {string} props.locale - Which language to render, independent of the route.
 * @param {object} props.dictionary - The **public** dictionary for that locale.
 */

/** Widths the main plate actually renders at, so Next can size the file. */
const MAIN_IMAGE_SIZES = '(max-width: 60rem) 92vw, 40rem';

/** The supporting images, which sit two or three to a row. */
const SUPPORTING_IMAGE_SIZES = '(max-width: 40rem) 44vw, (max-width: 60rem) 30vw, 16rem';

/**
 * The alt template each image role uses.
 *
 * A detail shot and a view in a room are not the same picture as the painting,
 * and giving all three the same alt text reads the title three times to a
 * screen reader while saying nothing about what changed. Per-image alt text
 * does exist in the database — `alt_he` / `alt_en` on `work_images` — but the
 * repository does not return it yet, so this is the fallback images.md
 * describes: derive it from the work, per language.
 */
const ALT_TEMPLATE_BY_TYPE = {
  main: 'imageAlt',
  detail: 'imageAltDetail',
  'in-situ': 'imageAltInSitu',
};

export default function ArtworkDetail({ work, locale, dictionary }) {
  const title = work.title[locale];
  const description = work.description[locale];
  const medium = mediumLabel(work, locale, dictionary);

  const altFor = (image) =>
    interpolate(dictionary.artwork[ALT_TEMPLATE_BY_TYPE[image?.type] ?? 'imageAlt'], {
      title,
      artist: dictionary.site.artistName,
    });

  /*
    A work legitimately has no photograph: she creates the record in the admin
    and attaches the picture afterwards, which is the order she works in. The
    frame reserves its box and says so rather than collapsing. On the preview
    this is the common case, because a work she has just entered has no image
    at all yet.
  */
  const mainImage = work.images.find((image) => image.type === 'main') ?? work.images[0];

  /*
    The close-up of the brushwork and the view in a room. No row carries either
    today — only `main` exists — so this is built for the shape rather than for
    the data, which is what stops it needing a redesign when they arrive.
  */
  const supporting = work.images.filter((image) => image !== mainImage);

  /*
    Only the facts this work actually has. Medium is optional and null on every
    current row; year is nullable too. An empty row saying nothing is worse than
    an absent one, and inventing a dash for it is a value nobody entered.
  */
  const specs = [
    medium && { key: 'medium', label: dictionary.artwork.medium, value: medium },
    {
      key: 'dimensions',
      label: dictionary.artwork.dimensions,
      value: formatDimensions(work.dimensions),
      /* Latin digits and a unit inside Hebrew prose — isolated, as the card does. */
      isolate: true,
    },
    work.year && { key: 'year', label: dictionary.artwork.year, value: String(work.year), isolate: true },
  ].filter(Boolean);

  return (
    <>
      <article className={styles.work}>
        <div className={styles.plate}>
          <ArtworkFrame
            image={mainImage}
            alt={altFor(mainImage)}
            emptyLabel={dictionary.artwork.noImage}
            sizes={MAIN_IMAGE_SIZES}
            /* The largest thing on the page, and the LCP element. */
            priority
            tone="bare"
            className={styles.mainFrame}
          />
        </div>

        <div className={styles.details}>
          <h1 className={styles.title}>{title}</h1>

          {specs.length > 0 ? (
            <dl className={styles.specs}>
              {specs.map((spec) => (
                <div key={spec.key} className={styles.spec}>
                  <dt className={styles.specLabel}>{spec.label}</dt>
                  <dd className={styles.specValue}>
                    {spec.isolate ? <bdi>{spec.value}</bdi> : spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/*
            Price and availability, from the same two components the card uses
            and reading the same table, so the price treatment and the badge
            cannot disagree about a state. Only two of the four statuses draw a
            badge, so the separator is conditional — otherwise an available work
            gets a hairline pointing at nothing.
          */}
          <p className={styles.availability}>
            <Price
              price={work.price}
              locale={locale}
              dictionary={dictionary}
              isPlaceholder={work.hasPlaceholderData}
              status={work.status}
            />
            {getStatusPresentation(work.status).badge ? (
              <>
                <span aria-hidden="true" className={styles.separator} />
                <StatusBadge status={work.status} dictionary={dictionary} />
              </>
            ) : null}
          </p>

          {/*
            The size, the year and the description are stand-ins on every seeded
            record, and deliberately absurd ones so they cannot ship unnoticed.
            The price marks itself; this is what keeps the rest from being read
            as fact. It goes here, under the numbers it disclaims, rather than at
            the foot of the page where it would be a disclaimer nobody reaches.
          */}
          {work.hasPlaceholderData ? (
            <p className={styles.placeholder}>{dictionary.placeholder.notice}</p>
          ) : null}

          {/*
            Draws itself only for a published, buyable work — so a draft in the
            admin preview, a sold painting and a work that is not for sale all
            simply have no button, rather than one that leads to a refusal.
          */}
          <AddToCart work={work} dictionary={dictionary} />

          {description ? (
            <div className={styles.description}>
              {/*
                Her own words, as she approved them in the admin. Split on blank
                lines so a description written as two paragraphs stays two
                paragraphs instead of collapsing into one run.
              */}
              {description.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : null}
        </div>
      </article>

      {supporting.length > 0 ? (
        <ul className={styles.supporting} aria-label={dictionary.artwork.moreImages}>
          {supporting.map((image) => (
            <li key={image.id}>
              {/*
                Mounted, not bare. These are small and several, which is the case
                the mount exists for — warm on warm, each needing its own edge.
                The bare tone above is for the one large work.
              */}
              <ArtworkFrame
                image={image}
                alt={altFor(image)}
                sizes={SUPPORTING_IMAGE_SIZES}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
