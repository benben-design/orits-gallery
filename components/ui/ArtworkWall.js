import ArtworkCard from './ArtworkCard';
import styles from './ArtworkWall.module.css';

/**
 * The wall: the gallery and the homepage grid (decided 30-10-2026).
 *
 * Each painting hangs at its own ratio, the full width of its column, on the
 * frame's thin "snug" board — two columns on a phone, three from 40rem, four
 * from 64rem.
 *
 * **The columns are filled here, on the server, and not by the browser.** CSS
 * columns were tried first and left the columns ending hundreds of pixels
 * apart — 363px on the homepage's twelve, worse at the foot of the gallery —
 * because the browser splits a list by height with no idea of what is in it.
 * Every painting's ratio is already known, so each one goes to whichever
 * column is shortest so far, ties to the first in reading order. That is what
 * keeps the bottom edge nearly level, and it also keeps the newest works along
 * the top of the wall, row by row, the way a visitor reads it.
 *
 * **One arrangement per column count, and CSS shows the one that fits.** The
 * column count depends on the screen, which the server cannot see, and moving
 * cards in the browser after they are drawn would be a layout shift on every
 * visit. So the three arrangements are all in the HTML and two are
 * `display: none`: hidden cards fetch no image (they are lazy) and are not in
 * the accessibility tree, so what they cost is markup and nothing else. The
 * one priority image is the same file in all three, and is preloaded once.
 *
 * A card's height is estimated as the painting's height plus a caption, both
 * in column widths. The caption share is larger where the column is narrower,
 * which is the whole reason it differs per arrangement. An estimate is enough:
 * it only decides which column a card joins, and a wrong guess costs a few
 * pixels of unevenness, never an overlap.
 */

/**
 * The widths a painting on the wall renders at: half the screen on a phone,
 * a third from 40rem, a quarter of the page frame from 64rem.
 */
const WALL_SIZES = '(max-width: 40rem) 46vw, (max-width: 64rem) 31vw, 18rem';

const ARRANGEMENTS = [
  /* Caption height as a share of the column's width: about 110px under a
     160px card on a phone, 95px under 220px, 90px under 270px. */
  { columns: 2, caption: 0.68, className: 'two' },
  { columns: 3, caption: 0.43, className: 'three' },
  { columns: 4, caption: 0.33, className: 'four' },
];

/** A painting's height in column widths; a work with no image takes the shared 4:5 box. */
function paintingHeight(work) {
  const image = work.images.find((candidate) => candidate.type === 'main') ?? work.images[0];
  return image ? image.height / image.width : 5 / 4;
}

/**
 * Each work to the shortest column so far, in order — then the bottom levelled.
 *
 * Filling in order alone left the columns up to 500px apart at the foot of the
 * gallery, because whatever the last few paintings happen to be decides where
 * each column ends. So a second pass moves one painting from the tallest
 * column to the shortest, or swaps one between them, whenever that brings the
 * two closer, until nothing helps. Each column is kept in list order, so the
 * newest works still hang highest. Pure and deterministic: the same list gives
 * the same wall on every render.
 */
function arrange(works, columns, caption) {
  const heightOf = (entry) => paintingHeight(entry.work) + caption;
  const lists = Array.from({ length: columns }, () => []);
  const heights = Array(columns).fill(0);

  works.forEach((work, index) => {
    const shortest = heights.indexOf(Math.min(...heights));
    lists[shortest].push({ work, index });
    heights[shortest] += paintingHeight(work) + caption;
  });

  for (let pass = 0; pass < works.length * 4; pass += 1) {
    const tall = heights.indexOf(Math.max(...heights));
    const short = heights.indexOf(Math.min(...heights));
    const gap = heights[tall] - heights[short];
    let best = null;

    for (const a of lists[tall]) {
      // Move one across: worth it while the move is shorter than the gap.
      const moved = Math.abs(gap - 2 * heightOf(a));
      if (moved < gap - 1e-6 && (!best || moved < best.after)) best = { after: moved, a, b: null };
      // Or swap a taller card for a shorter one.
      for (const b of lists[short]) {
        const swapped = Math.abs(gap - 2 * (heightOf(a) - heightOf(b)));
        if (swapped < gap - 1e-6 && (!best || swapped < best.after)) best = { after: swapped, a, b };
      }
    }

    if (!best) break;

    lists[tall] = lists[tall].filter((entry) => entry !== best.a);
    lists[short].push(best.a);
    heights[tall] -= heightOf(best.a);
    heights[short] += heightOf(best.a);
    if (best.b) {
      lists[short] = lists[short].filter((entry) => entry !== best.b);
      lists[tall].push(best.b);
      heights[short] -= heightOf(best.b);
      heights[tall] += heightOf(best.b);
    }
    lists[tall].sort((x, y) => x.index - y.index);
    lists[short].sort((x, y) => x.index - y.index);
  }

  return lists;
}

export default function ArtworkWall({ works, locale, dictionary, titleAs, priorityFirst = false }) {
  return (
    <div className={styles.wall}>
      {ARRANGEMENTS.map(({ columns, caption, className }) => (
        <div key={columns} className={`${styles.arrangement} ${styles[className]}`}>
          {arrange(works, columns, caption).map((column, columnIndex) => (
            <ul key={columnIndex} className={styles.column}>
              {column.map(({ work, index }) => (
                <li key={work.id}>
                  <ArtworkCard
                    work={work}
                    locale={locale}
                    dictionary={dictionary}
                    sizes={WALL_SIZES}
                    titleAs={titleAs}
                    frameTone="snug"
                    priority={priorityFirst && index === 0}
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      ))}
    </div>
  );
}
