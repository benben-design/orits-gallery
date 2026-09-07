/**
 * Contrast guard for the palette.
 *
 * Computes WCAG 2.1 contrast for every foreground/background pairing the design
 * rules actually permit, and fails if any of them drops below AA for normal
 * text (4.5:1).
 *
 * It also asserts the pairings the rules FORBID. That half matters more than it
 * looks: the known bad pairing — the secondary ink on the clay tint — misses AA
 * by four hundredths, which is exactly the kind of miss someone later "fixes"
 * by nudging a colour lighter. If that happens, this check fails and says why,
 * instead of quietly blessing a rule the palette was built to prevent.
 *
 * Values are read from app/tokens.css rather than restated here, so the guard
 * can never drift from the thing it guards.
 *
 * No dependencies.
 *
 *   npm run check:contrast
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_FILE = join(root, 'app', 'tokens.css');

/** AA for normal text. Large text would be 3:1; nothing here relies on that. */
const AA_NORMAL = 4.5;

// ---------------------------------------------------------------- //
// Reading the palette
// ---------------------------------------------------------------- //

const css = readFileSync(TOKENS_FILE, 'utf8');

function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\b`));
  if (!match) {
    console.error(`\n  Cannot find --${name} in app/tokens.css.`);
    console.error('  If a token was renamed, update this guard in the same change.\n');
    process.exit(2);
  }
  return match[1].toUpperCase();
}

// ---------------------------------------------------------------- //
// WCAG 2.1 relative luminance and contrast ratio
// ---------------------------------------------------------------- //

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- //
// The pairings the rules define.
//
// PERMITTED must clear AA. FORBIDDEN must NOT — each one encodes a rule
// that a well-meaning colour tweak would otherwise erase.
// ---------------------------------------------------------------- //

const PERMITTED = [
  ['text-primary', 'surface-wall', 'Body and headings on the page'],
  ['text-primary', 'surface-mat', 'Body on a card or artwork mat'],
  ['text-primary', 'surface-sunk', 'Body in the footer or filter bar'],
  ['text-primary', 'surface-tint', 'Text on a tinted panel'],
  ['text-primary', 'surface-tint-hover', 'The clay control, hovered'],
  ['text-primary', 'status-sold-bg', 'The reserved badge'],

  ['text-muted', 'surface-wall', 'Medium, dimensions, captions'],
  ['text-muted', 'surface-mat', 'Caption on a card'],
  ['text-muted', 'surface-sunk', 'Footer metadata'],

  ['accent', 'surface-wall', 'Links and buttons on the page'],
  ['accent', 'surface-mat', 'Links on a card or panel'],
  ['accent', 'surface-sunk', 'Links in the footer'],
  ['accent', 'surface-tint', 'Links on a tinted panel'],

  ['text-on-accent', 'accent', 'Label on a filled button'],
  ['text-on-accent', 'accent-hover', 'Label on a pressed button'],

  ['status-sold-text', 'status-sold-bg', 'The sold badge'],
];

const FORBIDDEN = [
  [
    'text-muted',
    'surface-tint',
    'The secondary ink on the clay tint',
    'Captions on a tinted panel must step up to --text-primary. Do not lighten '
      + 'the tint or darken --text-muted to make this pass — --text-muted is '
      + 'tuned against the wall, and the tint is a background, not a text ground.',
  ],
  [
    'surface-tint',
    'surface-wall',
    'The clay tint used as a text colour',
    'Only --accent may carry terracotta text. A softer, prettier terracotta for '
      + 'type is the rule this guard exists to protect: lightening the accent '
      + 'runs out of contrast almost immediately.',
  ],
  [
    'line-strong',
    'surface-mat',
    'A line token used as a text colour',
    'Line tokens draw hairlines and borders. They are not inks and must never '
      + 'be set as a text colour.',
  ],
];

// ---------------------------------------------------------------- //
// Output
// ---------------------------------------------------------------- //

const tty = process.stdout.isTTY;
const paint = (code, s) => (tty ? `[${code}m${s}[0m` : s);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const dim = (s) => paint('90', s);
const bold = (s) => paint('1', s);

const rows = [];
let failures = 0;

for (const [fg, bg, use] of PERMITTED) {
  const ratio = contrast(token(fg), token(bg));
  const ok = ratio >= AA_NORMAL;
  if (!ok) failures += 1;
  rows.push({
    kind: 'permitted',
    fg,
    bg,
    ratio,
    ok,
    use,
    // How much room before this pairing stops clearing AA.
    headroom: ratio - AA_NORMAL,
  });
}

for (const [fg, bg, use, why] of FORBIDDEN) {
  const ratio = contrast(token(fg), token(bg));
  const ok = ratio < AA_NORMAL; // forbidden pairings must stay below AA
  if (!ok) failures += 1;
  rows.push({ kind: 'forbidden', fg, bg, ratio, ok, use, why });
}

const w = {
  pair: Math.max(...rows.map((r) => `${r.fg} on ${r.bg}`.length)),
  use: Math.max(...rows.map((r) => r.use.length)),
};

function table(kind, title, subtitle, requirement) {
  const set = rows.filter((r) => r.kind === kind);
  console.log(`\n${bold(title)}`);
  console.log(dim(`  ${subtitle}`));
  console.log(
    dim(
      `  ${'pairing'.padEnd(w.pair)}  ${'ratio'.padStart(7)}  ${''.padEnd(6)}  ${'where it is used'.padEnd(w.use)}`,
    ),
  );
  for (const r of set) {
    const pair = `${r.fg} on ${r.bg}`.padEnd(w.pair);
    const ratio = `${r.ratio.toFixed(2)}:1`.padStart(7);
    const label = kind === 'permitted'
      ? (r.ok ? ' pass ' : ' FAIL ')
      : (r.ok ? ' held ' : ' LEAK ');
    const verdict = r.ok ? green(label.padEnd(6)) : red(label.padEnd(6));
    // Flag anything clearing AA by under 0.25 — it will not survive a
    // casual tweak, and a reader deserves to know which pairings are tight.
    const tight =
      kind === 'permitted' && r.ok && r.headroom < 0.25
        ? dim(`  <- ${r.headroom.toFixed(2)} headroom`)
        : '';
    console.log(`  ${pair}  ${ratio}  ${verdict}  ${r.use.padEnd(w.use)}${tight}`);
  }
  console.log(dim(`  ${requirement}`));
}

console.log(bold('\nPalette contrast — WCAG 2.1, AA for normal text (4.5:1)'));
console.log(dim(`  Values read from app/tokens.css`));

table(
  'permitted',
  'Permitted pairings',
  'Every foreground/background combination the design rules allow.',
  `must be >= ${AA_NORMAL.toFixed(1)}:1`,
);

table(
  'forbidden',
  'Forbidden pairings',
  'Asserted as failing on purpose. If one of these starts passing, a rule was erased.',
  `must be <  ${AA_NORMAL.toFixed(1)}:1`,
);

if (failures === 0) {
  const tight = rows.filter((r) => r.kind === 'permitted' && r.headroom < 0.25).length;
  console.log(
    green(`\n  ${rows.length} pairings checked, all as specified.`) +
      (tight
        ? dim(`  ${tight} clear AA by under 0.25 — treat those values as fixed.`)
        : ''),
  );
  console.log('');
  process.exit(0);
}

console.log(red(`\n  ${failures} of ${rows.length} pairings are wrong.\n`));

for (const r of rows.filter((x) => !x.ok)) {
  if (r.kind === 'permitted') {
    console.log(
      red(`  ${r.fg} on ${r.bg}`) +
        ` is ${r.ratio.toFixed(2)}:1, below the ${AA_NORMAL}:1 floor for normal text.`,
    );
    console.log(dim(`    Used for: ${r.use}`));
    console.log(
      dim('    Darken the foreground or lighten the background until it clears AA.\n'),
    );
  } else {
    console.log(
      red(`  ${r.fg} on ${r.bg}`) +
        ` is ${r.ratio.toFixed(2)}:1 — it now PASSES AA, and it is not allowed to.`,
    );
    console.log(dim(`    ${r.use}.`));
    console.log(dim(`    ${r.why}`));
    console.log(
      dim('    If this pairing is genuinely meant to be allowed now, move it to'),
    );
    console.log(dim('    PERMITTED in this file and update frontend/styles.md.\n'));
  }
}

process.exit(1);
