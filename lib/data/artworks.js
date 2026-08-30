/**
 * The local stand-in for the works table.
 *
 * This file is the *storage* for painting data at this stage of the project.
 * It is deliberately dumb: raw records in, fully-shaped work objects out.
 *
 * IMPORTANT: nothing outside lib/data may import this file. Pages, layouts and
 * components go through lib/data/works-repository.js instead. When this is
 * replaced by a real database this file disappears, and only the repository
 * changes. See .claude/rules/data-layer.md.
 */
import imageManifest from './image-manifest.json';

/**
 * A work's lifecycle state. Deliberately not a boolean: every painting is a
 * one-off, and it may also be selling through a gallery or another platform,
 * so the model has to express more than sold / not sold.
 */
export const WORK_STATUSES = ['available', 'reserved', 'sold', 'not-for-sale'];

export const WORK_CATEGORIES = ['landscape', 'still-life'];

/** The role an image plays for a work. Order within a work is by `position`. */
export const IMAGE_TYPES = ['main', 'detail', 'in-situ'];

/* ------------------------------------------------------------------ *
 * Placeholder values
 *
 * Dimensions, prices, descriptions, media and years are not known yet.
 * These stand-ins are intentionally absurd so they can never be mistaken
 * for real values or ship by accident. Titles, categories and slugs are real.
 * ------------------------------------------------------------------ */

const PLACEHOLDER_DIMENSIONS = { width: 999, height: 999, unit: 'cm' };
const PLACEHOLDER_PRICE = { amount: 99999, currency: 'ILS' };
const PLACEHOLDER_YEAR = 1000;

const PLACEHOLDER_MEDIUM = {
  he: '[ממלא מקום] טכניקה טרם הוזנה',
  en: '[PLACEHOLDER] Medium not recorded yet',
};

const PLACEHOLDER_DESCRIPTION = {
  he: '[טקסט זמני] תיאור העבודה טרם נכתב. הטקסט הזה הוא ממלא מקום בלבד.',
  en: '[PLACEHOLDER] The description for this work has not been written yet.',
};

/* ------------------------------------------------------------------ *
 * Records
 *
 * `id` doubles as the English slug and as the painting's filename stem in
 * public/paintings. The Hebrew slug is the Hebrew title with spaces hyphenated.
 * `addedAt` is what "most recent" is ordered by.
 * ------------------------------------------------------------------ */

const records = [
  // Landscapes
  {
    id: 'reeds-at-sunset',
    slugHe: 'קנים-בשקיעה',
    titleHe: 'קנים בשקיעה',
    titleEn: 'Reeds at Sunset',
    category: 'landscape',
    status: 'available',
    // Carries the homepage hero. At 1.512 it is the widest work in the set,
    // but the hero frame follows whichever work is featured, so this flag can
    // move to any record without a layout change. See components/home/Hero.js.
    featured: true,
    addedAt: '2026-08-30',
  },
  {
    id: 'tree-grove',
    slugHe: 'חורשת-עצים',
    titleHe: 'חורשת עצים',
    titleEn: 'Tree Grove',
    category: 'landscape',
    status: 'available',
    addedAt: '2026-08-14',
  },
  {
    id: 'tuscan-house',
    slugHe: 'בית-טוסקני',
    titleHe: 'בית טוסקני',
    titleEn: 'Tuscan House',
    category: 'landscape',
    status: 'sold',
    addedAt: '2026-08-13',
  },
  {
    id: 'marsh-at-sunset',
    slugHe: 'ביצה-בשקיעה',
    titleHe: 'ביצה בשקיעה',
    titleEn: 'Marsh at Sunset',
    category: 'landscape',
    status: 'available',
    addedAt: '2026-08-12',
  },
  {
    id: 'garden-door',
    slugHe: 'שער-הגן',
    titleHe: 'שער הגן',
    titleEn: 'Garden Door',
    category: 'landscape',
    status: 'reserved',
    addedAt: '2026-08-11',
  },
  {
    id: 'autumn-tree-by-water',
    slugHe: 'עץ-סתווי-על-המים',
    titleHe: 'עץ סתווי על המים',
    titleEn: 'Autumn Tree by the Water',
    category: 'landscape',
    status: 'available',
    addedAt: '2026-08-10',
  },
  {
    id: 'poplar-path',
    slugHe: 'שדרת-הצפצפות',
    titleHe: 'שדרת הצפצפות',
    titleEn: 'Poplar Path',
    category: 'landscape',
    status: 'not-for-sale',
    addedAt: '2026-08-09',
  },
  {
    id: 'cabin-by-the-lake',
    slugHe: 'בקתה-על-האגם',
    titleHe: 'בקתה על האגם',
    titleEn: 'Cabin by the Lake',
    category: 'landscape',
    status: 'available',
    addedAt: '2026-08-08',
  },

  // Still life
  {
    id: 'lemons',
    slugHe: 'לימונים',
    titleHe: 'לימונים',
    titleEn: 'Lemons',
    category: 'still-life',
    status: 'available',
    addedAt: '2026-08-07',
  },
  {
    id: 'watermelon-and-jug',
    slugHe: 'אבטיח-וקנקן',
    titleHe: 'אבטיח וקנקן',
    titleEn: 'Watermelon and Jug',
    category: 'still-life',
    status: 'available',
    addedAt: '2026-08-06',
  },
  {
    id: 'wine-and-grapes',
    slugHe: 'יין-וענבים',
    titleHe: 'יין וענבים',
    titleEn: 'Wine and Grapes',
    category: 'still-life',
    status: 'sold',
    addedAt: '2026-08-05',
  },
  {
    id: 'pink-roses',
    slugHe: 'ורדים-ורודים',
    titleHe: 'ורדים ורודים',
    titleEn: 'Pink Roses',
    category: 'still-life',
    status: 'available',
    addedAt: '2026-08-04',
  },
  {
    id: 'two-pears',
    slugHe: 'שני-אגסים',
    titleHe: 'שני אגסים',
    titleEn: 'Two Pears',
    category: 'still-life',
    status: 'reserved',
    addedAt: '2026-08-03',
  },
  {
    id: 'artichokes',
    slugHe: 'ארטישוקים',
    titleHe: 'ארטישוקים',
    titleEn: 'Artichokes',
    category: 'still-life',
    status: 'available',
    addedAt: '2026-08-02',
  },
  {
    id: 'whiskey-and-glass',
    slugHe: 'ויסקי-וכוס',
    titleHe: 'ויסקי וכוס',
    titleEn: 'Whiskey and Glass',
    category: 'still-life',
    status: 'not-for-sale',
    addedAt: '2026-08-01',
  },
  {
    id: 'avocado',
    slugHe: 'אבוקדו',
    titleHe: 'אבוקדו',
    titleEn: 'Avocado',
    category: 'still-life',
    status: 'available',
    addedAt: '2026-07-31',
  },
];

/**
 * Expands a raw record into the work shape the rest of the app consumes.
 *
 * Image dimensions come from lib/data/image-manifest.json, which is generated
 * from the actual files by scripts/generate-image-manifest.mjs on every build.
 * They are never typed by hand — the works grid depends on them being true.
 */
function toWork(record) {
  const image = imageManifest[record.id];
  if (!image) {
    throw new Error(
      'No image in the manifest for "' +
        record.id +
        '". Add public/paintings/' +
        record.id +
        '.jpg and re-run: npm run images:manifest'
    );
  }

  return {
    id: record.id,
    slug: { he: record.slugHe, en: record.id },
    title: { he: record.titleHe, en: record.titleEn },
    description: { ...PLACEHOLDER_DESCRIPTION },
    medium: { ...PLACEHOLDER_MEDIUM },
    dimensions: { ...PLACEHOLDER_DIMENSIONS },
    year: PLACEHOLDER_YEAR,
    price: { ...PLACEHOLDER_PRICE },
    category: record.category,
    status: record.status,
    featured: record.featured === true,
    addedAt: record.addedAt,
    /**
     * Ordered collection. Only "main" images exist today — one scan per
     * painting — but the shape carries `type` and `position` so that detail
     * and in-situ shots slot in later without a model change.
     */
    images: [
      {
        id: record.id + '--main',
        type: 'main',
        position: 0,
        src: image.src,
        width: image.width,
        height: image.height,
      },
    ],
    /** Flags the fake dimensions / price / description / medium / year above. */
    hasPlaceholderData: true,
  };
}

/** Every work, in no particular order. Sorting and filtering is the repository's job. */
export function readAllRecords() {
  return records.map(toWork);
}
