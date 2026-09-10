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
 * One painting, large, beside the label that names it.
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
 * ## The arrangement
 *
 * **The label sits at the inline start and the painting at the inline end** —
 * on the right and on the left respectively in Hebrew, mirrored in English.
 * That follows gitahomedesign.co.il, the artist's own store and this project's
 * stated visual reference, whose product page puts the name and the price where
 * the eye lands first and the photograph beside them.
 *
 * It is one property rather than two layouts: the painting comes first in the
 * DOM, so stacking on a phone puts the work above its label with nothing
 * reordered, and `flex-direction: row-reverse` at the wide breakpoint moves the
 * label to the inline start in **both** writing directions at once.
 *
 * ## The frame takes the painting's own shape
 *
 * The grid's frame is a fixed square because equal boxes are what keep rows
 * aligned. **A single work on its own page has no row to align with**, so here
 * the frame is set to the painting's own aspect ratio and the box *is* the
 * work — the same never-crop rule arrived at from the other side.
 *
 * That is not cosmetic. A 0.62 portrait fitted into a square frame filled about
 * 335px of a 544px box, and the leftover 209px sat between the painting and its
 * label as ground nobody chose. `--work-ratio` is read off the real pixel
 * dimensions of the file, so the box cannot disagree with the painting in it.
 *
 * ## The reading order, and the two placements inside it that are decisions
 *
 * Category, title, price, her description, the physical facts, then the buy
 * control — the order a gallery label is read in, and the order Gita's product
 * page uses.
 *
 *   - **The placeholder notice sits directly above the buy control**, under the
 *     numbers it disclaims. A call to action reading past a disclaimer it has
 *     not met yet is how a stand-in figure gets treated as real.
 *   - **`AddToCart` is last and draws itself only when the work is published
 *     and buyable**, which is what keeps this component honest across its two
 *     callers: the preview renders a *draft*, and a draft is not for sale at
 *     any status, so the control removes itself rather than the page having to
 *     know which route it is on.
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
 * of the thing being looked at. A caller must not add a second one. It does
 * **not** render the breadcrumb: that is page navigation rather than part of
 * the work, and the preview deliberately shows the work inside the admin's own
 * chrome. The public route owns it.
 *
 * @param {object} props
 * @param {object} props.work - A work as the repository returns it, from either scope.
 * @param {string} props.locale - Which language to render, independent of the route.
 * @param {object} props.dictionary - The **public** dictionary for that locale.
 */

/**
 * The tallest a work hangs beside its label, in rem, mirroring `--plate-block`
 * in the stylesheet. Duplicated deliberately and cheaply: `sizes` is an HTML
 * attribute and cannot read a custom property, and the failure it prevents is
 * described in `mainImageSizes` below.
 */
const PLATE_BLOCK_REM = 40;

/**
 * The width the painting actually occupies, per work.
 *
 * **`sizes` is not only a download hint here — it decides the layout.** With
 * `width: auto` on the image, the browser derives the intrinsic width from the
 * candidate it picked, and that candidate is picked to match `sizes`. So a
 * `sizes` smaller than the real slot does not merely fetch a small file, it
 * *draws the painting small*: while this read a fixed `34rem`, a 1600px-wide
 * landscape rendered at exactly 544px inside a 772px frame, inset by 114px on
 * each side, and nothing about the page looked broken.
 *
 * The plate is bounded by height, so its width is the ceiling times the work's
 * own ratio. Rounding up keeps this an over-estimate, which costs a slightly
 * larger file and never an undersized painting.
 */
function mainImageSizes(ratio) {
  return `(max-width: 60rem) 92vw, ${Math.ceil(PLATE_BLOCK_REM * ratio)}rem`;
}

/** The supporting images, which sit two or three to a row. */
const SUPPORTING_IMAGE_SIZES = '(max-width: 40rem) 44vw, (max-width: 60rem) 30vw, 16rem';

/**
 * The shape the frame falls back to when there is no photograph yet.
 *
 * A work is created in the admin before its picture is attached, so this is a
 * normal state of a real record rather than an error — and on the preview it is
 * the common one. 0.8 is the grid's 4/5 written as the plain number the width
 * calculation needs; a ratio expression cannot be multiplied by a length.
 */
const FALLBACK_RATIO = 0.8;

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
    frame reserves its box and says so rather than collapsing.
  */
  const mainImage = work.images.find((image) => image.type === 'main') ?? work.images[0];

  /*
    The painting's own shape, from the real pixel dimensions of the file — the
    same numbers the grid uses to reserve its box, never typed by hand. The
    frame is built from this rather than from the shared square, so there is no
    ground between the work and its label that belongs to neither.
  */
  const workRatio =
    mainImage?.width && mainImage?.height ? mainImage.width / mainImage.height : FALLBACK_RATIO;

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
      {/*
        The ratio travels as a custom property rather than as a width, so the
        stylesheet keeps deciding how it is bounded — by height beside the
        label, by the column on a phone — and the component only says what
        shape the work is.
      */}
      <article className={styles.work} style={{ '--work-ratio': workRatio }}>
        <div className={styles.plate}>
          <ArtworkFrame
            image={mainImage}
            alt={altFor(mainImage)}
            emptyLabel={dictionary.artwork.noImage}
            sizes={mainImageSizes(workRatio)}
            /* The largest thing on the page, and the LCP element. */
            priority
            tone="bare"
            className={styles.mainFrame}
          />
        </div>

        <div className={styles.label}>
          {/*
            The category, as the eyebrow a wall label carries. Data rather than
            decoration — it is the same closed set the gallery filters on — and
            deliberately not a link: a second control beside the heading would
            compete with the one thing this page is asking for, and inside the
            admin preview it would navigate out of the admin entirely.
          */}
          {dictionary.category[work.category] ? (
            <p className={styles.eyebrow}>{dictionary.category[work.category]}</p>
          ) : null}

          <h1 className={styles.title}>{title}</h1>

          {/*
            Price and availability, from the same two components the card uses
            and reading the same table, so the price treatment and the badge
            cannot disagree about a state. Only two of the four statuses draw a
            badge, so the separator is conditional — otherwise an available work
            gets a hairline pointing at nothing.

            It sits directly under the title because on a painting the price is
            part of the label rather than a control: the two together are the
            identity of the thing, and a visitor who has to hunt for the figure
            reads the absence as evasiveness.
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

          {/*
            The physical facts, below the rule that separates what the work is
            from what it measures. A definition list because that is what they
            are — a label and its value — and because it reads correctly to a
            screen reader, where a two-column layout of loose spans does not.
          */}
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
            The size, the year and the description are stand-ins on every seeded
            record, and deliberately absurd ones so they cannot ship unnoticed.
            The price marks itself; this is what keeps the rest from being read
            as fact. It goes directly above the buy control, under the numbers
            it disclaims, rather than at the foot of the page where it would be
            a disclaimer nobody reaches.
          */}
          {work.hasPlaceholderData ? (
            <p className={styles.placeholder}>{dictionary.placeholder.notice}</p>
          ) : null}

          {/*
            Draws itself only for a published, buyable work — so a draft in the
            admin preview, a sold painting and a work that is not for sale all
            simply have no button, rather than one that leads to a refusal.
          */}
          <AddToCart work={work} dictionary={dictionary} locale={locale} />
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
