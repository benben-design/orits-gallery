import Link from 'next/link';
import ArtworkCard from '@/components/ui/ArtworkCard';
import ButtonLink from '@/components/ui/ButtonLink';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { defaultLocale } from '@/lib/i18n/config';
import { WORK_STATUSES } from '@/lib/data/works-repository';
import { requireAdminSession } from '@/lib/auth/admin-guard';
import styles from './page.module.css';

/**
 * The design system, rendered — at /admin/dev, behind the admin guard.
 *
 * A permanent developer tool: every colour on the surface it is meant to be
 * used on, the spacing and radius scales, the interactive states, and the real
 * artwork component across every orientation and every status. It needs no
 * database and no real content, so it stays reviewable however little of the
 * site is built.
 *
 * Two deliberate departures from the project rules, both because this page is
 * tooling rather than product:
 *
 *   1. Its labels are literal English rather than dictionary keys. They are
 *      token identifiers and developer prose — "--surface-wall", "2px" — and
 *      putting sixty of them into he.json and en.json would bloat the
 *      dictionaries that ship to every visitor with strings no visitor sees.
 *      The *specimens* below still take every string from the dictionary, so
 *      the components themselves are exercised honestly.
 *
 *   2. The specimens set dir/lang on inner elements. On the public site that
 *      is forbidden; here it is the point, because the page exists to show how
 *      the components behave in the direction most visitors read.
 *
 * The placeholder paintings come from scripts/generate-dev-placeholders.mjs.
 * They are generated, not photographed: the only property that matters here is
 * aspect ratio, and using real work would turn a component specimen into a
 * content preview tied to whatever is in public/paintings today.
 */

/* ------------------------------------------------------------------ *
 * Palette, described the way it is meant to be read: each swatch names
 * its role and value, and sits on the surface it is actually used on.
 * ------------------------------------------------------------------ */
const PALETTE = [
  {
    group: 'Surfaces',
    note: 'The wall is the page. Everything else sits on it.',
    on: 'wall',
    swatches: [
      { token: '--surface-wall', value: '#F0E7D2', role: 'Page background — the wall' },
      { token: '--surface-mat', value: '#FBFAF7', role: 'Cards, mats, panels, modals' },
      { token: '--surface-sunk', value: '#EBDFC1', role: 'Inset areas: footer, filter bar' },
      { token: '--surface-tint', value: '#EBD9CE', role: 'Clay tint — background only, never text' },
    ],
  },
  {
    group: 'Text',
    note: 'Shown on the mat, where body copy actually sits. Never pure black.',
    on: 'mat',
    swatches: [
      { token: '--text-primary', value: '#2C2723', role: 'Body and headings', ink: true },
      { token: '--text-muted', value: '#6B6058', role: 'Medium, dimensions, captions', ink: true },
    ],
  },
  {
    group: 'Lines',
    note: 'Shown at their real weight — one hairline, not a filled block.',
    on: 'mat',
    swatches: [
      { token: '--line', value: '#DED5C9', role: 'Hairlines, dividers, card borders', line: true },
      { token: '--line-strong', value: '#C9BCA9', role: 'Emphasised borders, input outlines', line: true },
    ],
  },
];

const SPACING = [
  ['--space-1', '0.25rem', '4px'],
  ['--space-2', '0.5rem', '8px'],
  ['--space-3', '0.75rem', '12px'],
  ['--space-4', '1rem', '16px'],
  ['--space-5', '1.5rem', '24px'],
  ['--space-6', '2rem', '32px'],
  ['--space-7', '2.5rem', '40px'],
  ['--space-8', '3rem', '48px'],
  ['--space-9', '4rem', '64px'],
  ['--space-10', '5rem', '80px'],
  ['--space-11', '6.5rem', '104px'],
  ['--space-12', '8rem', '128px'],
];

const RADII = [
  ['--radius-none', '0', 'Frames, mats, anything holding a painting'],
  ['--radius-sm', '2px', 'The working default'],
  ['--radius-md', '4px', 'The ceiling — nothing on this site is rounder'],
];

/* ------------------------------------------------------------------ *
 * Placeholder works, shaped exactly like what the repository returns so
 * ArtworkCard is exercised for real rather than approximated.
 * ------------------------------------------------------------------ */
const IMAGES = {
  portrait: { type: 'main', src: '/admin/dev/placeholder-portrait.png', width: 800, height: 1200 },
  square: { type: 'main', src: '/admin/dev/placeholder-square.png', width: 1000, height: 1000 },
  landscape: { type: 'main', src: '/admin/dev/placeholder-landscape.png', width: 1400, height: 950 },
};

const ORIENTATION_TITLES = {
  portrait: { he: 'ממלא מקום · לאורך', en: 'Placeholder · Portrait' },
  square: { he: 'ממלא מקום · ריבועי', en: 'Placeholder · Square' },
  landscape: { he: 'ממלא מקום · לרוחב', en: 'Placeholder · Landscape' },
};

function makeWork(id, orientation, status) {
  return {
    id,
    slug: { he: id, en: id },
    title: ORIENTATION_TITLES[orientation],
    medium: {
      he: '[ממלא מקום] טכניקה טרם הוזנה',
      en: '[PLACEHOLDER] Medium not recorded yet',
    },
    dimensions: { width: 999, height: 999, unit: 'cm' },
    price: { amount: 99999, currency: 'ILS' },
    year: 1000,
    category: 'still-life',
    status,
    images: [IMAGES[orientation]],
    featured: false,
    addedAt: '2026-01-01',
    hasPlaceholderData: true,
  };
}

/** Six cards, two of each orientation, in the grid the gallery will use. */
const GRID_WORKS = [
  makeWork('grid-portrait-1', 'portrait', 'available'),
  makeWork('grid-square-1', 'square', 'available'),
  makeWork('grid-landscape-1', 'landscape', 'available'),
  makeWork('grid-portrait-2', 'portrait', 'available'),
  makeWork('grid-square-2', 'square', 'available'),
  makeWork('grid-landscape-2', 'landscape', 'available'),
];

/** One card per status, so the four presentations sit side by side. */
const STATUS_WORKS = WORK_STATUSES.map((status) =>
  makeWork(`status-${status}`, 'portrait', status),
);

const GRID_SIZES = '(max-width: 40rem) 92vw, (max-width: 64rem) 44vw, 22rem';

export default async function DesignSystemPage() {
  /*
    Signed in only. Under /admin for the reason the admin api routes are: the
    session cookie is scoped to that path, so a guard at /dev could never have
    seen one. Checked by scripts/check-admin-guard.mjs like every guarded page.
  */
  await requireAdminSession('/admin/dev');

  const locale = defaultLocale;
  const dictionary = await getDictionary(locale);

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <p className={styles.eyebrow}>Developer tool · not indexed · not in navigation</p>
        <h1 className={styles.h1}>Design system</h1>
        <p className={styles.lede}>
          Every token and component on this page is the real one, rendered from{' '}
          <code>app/tokens.css</code> and <code>components/</code>. Specimens are shown in
          Hebrew and right-to-left, because that is the default and the harder case.
        </p>
      </header>

      {/* ---- Colour ------------------------------------------------ */}
      <section className={styles.section}>
        <h2 className={styles.h2}>Colour</h2>

        {PALETTE.map((group) => (
          <div key={group.group} className={styles.group}>
            <h3 className={styles.h3}>{group.group}</h3>
            <p className={styles.note}>{group.note}</p>
            <ul
              className={`${styles.swatches} ${group.on === 'mat' ? styles.onMat : styles.onWall}`}
            >
              {group.swatches.map((s) => (
                <li key={s.token} className={styles.swatch}>
                  {s.line ? (
                    <span className={styles.chipLine} style={{ backgroundColor: s.value }} />
                  ) : s.ink ? (
                    <span className={styles.chipInk} style={{ color: s.value }}>
                      Aa · אב
                    </span>
                  ) : (
                    <span className={styles.chip} style={{ backgroundColor: s.value }} />
                  )}
                  <span className={styles.swatchMeta}>
                    <code className={styles.token}>{s.token}</code>
                    <code className={styles.value}>{s.value}</code>
                    <span className={styles.role}>{s.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className={styles.group}>
          <h3 className={styles.h3}>Accent</h3>
          <p className={styles.note}>
            The one accent. Reserved for interactive things — links, buttons, active and
            focus state — and never used as ornament.
          </p>
          <ul className={`${styles.swatches} ${styles.onWall}`}>
            <li className={styles.swatch}>
              <span className={styles.chipInk} style={{ color: '#8C4A33' }}>
                Aa · אב
              </span>
              <span className={styles.swatchMeta}>
                <code className={styles.token}>--accent</code>
                <code className={styles.value}>#8C4A33</code>
                <span className={styles.role}>Links, buttons, active state — 5.43:1 on the wall</span>
              </span>
            </li>
            <li className={styles.swatch}>
              <span className={styles.chip} style={{ backgroundColor: '#743C29' }} />
              <span className={styles.swatchMeta}>
                <code className={styles.token}>--accent-hover</code>
                <code className={styles.value}>#743C29</code>
                <span className={styles.role}>Hover and pressed</span>
              </span>
            </li>
            <li className={styles.swatch}>
              <span className={styles.chipOnAccent}>Aa · אב</span>
              <span className={styles.swatchMeta}>
                <code className={styles.token}>--text-on-accent</code>
                <code className={styles.value}>#FBF7F3</code>
                <span className={styles.role}>Text on the accent — 6.27:1</span>
              </span>
            </li>
          </ul>
        </div>

        <div className={styles.group}>
          <h3 className={styles.h3}>Status</h3>
          <p className={styles.note}>
            Shown as the badge they actually build. Status is never carried by colour alone
            — see the four states further down.
          </p>
          <ul className={`${styles.swatches} ${styles.onWall}`}>
            <li className={styles.swatch}>
              <span className={styles.chipBadge}>{dictionary.status.sold}</span>
              <span className={styles.swatchMeta}>
                <code className={styles.token}>--status-sold-bg / --status-sold-text</code>
                <code className={styles.value}>#EBD9CE / #6B3A28</code>
                <span className={styles.role}>The sold badge — 6.79:1</span>
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* ---- Spacing ----------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>Spacing</h2>
        <p className={styles.note}>A 4px base, generous by default. This is a gallery.</p>
        <ul className={styles.scale}>
          {SPACING.map(([token, rem, px]) => (
            <li key={token} className={styles.scaleRow}>
              <code className={styles.token}>{token}</code>
              <code className={styles.value}>{rem}</code>
              <code className={styles.value}>{px}</code>
              <span className={styles.bar} style={{ inlineSize: rem }} />
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Radius ------------------------------------------------ */}
      <section className={styles.section}>
        <h2 className={styles.h2}>Radius</h2>
        <p className={styles.note}>
          Low by design. A soft corner reads as a widget, and the things on these pages are
          paintings, not controls.
        </p>
        <ul className={styles.radii}>
          {RADII.map(([token, value, role]) => (
            <li key={token} className={styles.radiusItem}>
              <span className={styles.radiusBox} style={{ borderRadius: value }} />
              <code className={styles.token}>{token}</code>
              <code className={styles.value}>{value}</code>
              <span className={styles.role}>{role}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Interactive states ------------------------------------ */}
      <section className={styles.section}>
        <h2 className={styles.h2}>Interactive states</h2>
        <p className={styles.note}>
          The hovered and focused specimens are drawn in their state so both are visible at
          once; the live controls beside them respond for real. Tab into the page to see the
          focus ring move.
        </p>
        <div className={styles.states}>
          <div className={styles.state}>
            <ButtonLink href="/admin/dev">Rest</ButtonLink>
            <span className={styles.stateLabel}>Button · rest</span>
          </div>
          <div className={styles.state}>
            <span className={styles.buttonHovered}>Hovered</span>
            <span className={styles.stateLabel}>Button · hover</span>
          </div>
          <div className={styles.state}>
            <span className={styles.buttonFocused}>Focused</span>
            <span className={styles.stateLabel}>Button · focus ring</span>
          </div>
          <div className={styles.state}>
            <ButtonLink href="/admin/dev" variant="primary">Primary</ButtonLink>
            <span className={styles.stateLabel}>Button · primary, live — one in view at most</span>
          </div>
          <div className={styles.state}>
            <Link className={styles.link} href="/admin/dev">
              A text link
            </Link>
            <span className={styles.stateLabel}>Link · live, hover and focus it</span>
          </div>
        </div>
      </section>

      {/* ---- The artwork component --------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>Artwork grid</h2>
        <p className={styles.note}>
          Six works, two of each orientation, in the grid the gallery will use. Every frame
          is the same height and no painting is cropped — the placeholders make that easy to
          check, because their borders show exactly where each one ends.
        </p>
        <div className={styles.specimen} dir="rtl" lang="he">
          <ul className={styles.grid}>
            {GRID_WORKS.map((work) => (
              <li key={work.id} className={styles.cell}>
                <ArtworkCard
                  work={work}
                  locale={locale}
                  dictionary={dictionary}
                  sizes={GRID_SIZES}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- The four statuses ------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>Status states</h2>
        <p className={styles.note}>
          All four, side by side. Available carries no badge and a plain price; reserved adds
          a badge; sold adds a badge and strikes the price; not-for-sale has no badge and no
          price at all. The distinctions are in form, not colour.
        </p>
        <div className={styles.specimen} dir="rtl" lang="he">
          <ul className={styles.grid}>
            {STATUS_WORKS.map((work) => (
              <li key={work.id} className={styles.cell}>
                <p className={styles.statusCaption}>{work.status}</p>
                <ArtworkCard
                  work={work}
                  locale={locale}
                  dictionary={dictionary}
                  sizes={GRID_SIZES}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
