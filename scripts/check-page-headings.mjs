/**
 * Asserts that every public page renders a top-level heading.
 *
 * WHY THIS EXISTS
 *
 * The homepage and the gallery shipped with no <h1> at all — WCAG 1.3.1, Level
 * A, on the two most visited pages — and nothing noticed until it was measured
 * in a browser. A page's outline is invisible on screen, so a missing heading
 * looks exactly like a present one to everybody who can see the page.
 *
 * THE TRAP THIS IS BUILT AROUND
 *
 * Almost no page here writes the tag. The placeholder pages get their heading
 * from StubPage, the artwork page from ArtworkDetail, the homepage from Hero,
 * and the cart, checkout, order and gallery pages by asking SectionHeading for
 * `as="h1"`. A search for `<h1` in page files would fail pages that are
 * correct, and the first thing anyone does about a guard that cries wolf is
 * weaken it.
 *
 * So it follows the page's imports. A component counts as producing a heading
 * when its own source writes `<h1` or passes `as="h1"`, or when it renders a
 * component that does — worked out from the source every run rather than kept
 * as a list, so that taking the <h1> out of Hero fails the homepage instead of
 * leaving a list that still says Hero has one.
 *
 * Comments are stripped before anything is searched. Several of them mention
 * `<h1>` in prose, and a comment saying a heading is there is precisely what
 * outlives the heading.
 *
 * **The 404 and the error page are checked too** — `not-found.js` and
 * `error.js` are what a visitor sees as surely as any `page.js`. And a page
 * whose only job is to call `notFound()` (the `[...missing]` catch-all) renders
 * nothing of its own, so it is judged by the nearest `not-found.js` above it,
 * which is what actually reaches the screen — rather than passing because it
 * imports something with a heading it never renders.
 *
 * What it cannot see: a heading rendered in one branch of a conditional and not
 * the other. The order page renders one of three, each with its own <h1>; this
 * check confirms the page renders a heading somewhere, not on every path.
 *
 * Same shape as the other guards: no dependencies, run by `npm run lint`,
 * prints a table either way.
 *
 * Exit codes: 0 every page renders one, 1 one does not, 2 the public route
 * tree has moved and this script needs to move with it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const PAGES_DIR = join(ROOT, 'app', '(site)', '[locale]');

/** The tag itself, as JSX writes it. */
const LITERAL_H1 = /<h1[\s>/]/;

/** A tag-parameterised component asked for one: SectionHeading, or Section. */
const AS_H1 = /\bas=(?:"h1"|'h1'|\{\s*['"]h1['"]\s*\})/;

const display = (file) => relative(ROOT, file).split(sep).join('/');

/* ------------------------------------------------------------------ *
 * Reading source.
 * ------------------------------------------------------------------ */

/**
 * The source with comments removed. Block comments cover JSX's `{/* *\/}` as
 * well; a line comment is only taken from `//` that does not follow a colon,
 * so the `https://` inside a string survives.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Resolves an import specifier to a file in this repository, or null. */
function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith('@/')) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith('.')) base = join(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    if (candidate.endsWith('.js') && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every local name this file imports from a file of ours, and from where. */
function readImports(source, file) {
  const imports = new Map();
  const pattern = /import\s+([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;

  for (const [, defaultName, named, specifier] of source.matchAll(pattern)) {
    const target = resolveImport(specifier, file);
    if (!target) continue;
    if (defaultName) imports.set(defaultName, target);
    for (const part of (named ?? '').split(',')) {
      const local = part.trim().split(/\s+as\s+/).pop();
      if (local) imports.set(local, target);
    }
  }

  return imports;
}

const sources = new Map();

async function load(file) {
  if (!sources.has(file)) sources.set(file, stripComments(await readFile(file, 'utf8')));
  return sources.get(file);
}

/* ------------------------------------------------------------------ *
 * Where a heading comes from.
 * ------------------------------------------------------------------ */

const verdicts = new Map();

/**
 * How this file renders an <h1>, as a short description — or null if it does
 * not. Follows rendered components depth first; a cycle answers null for the
 * repeat rather than looping.
 */
async function headingSource(file, visiting = new Set()) {
  if (verdicts.has(file)) return verdicts.get(file);
  if (visiting.has(file)) return null;
  visiting.add(file);

  const source = await load(file);
  let verdict = null;

  if (LITERAL_H1.test(source)) {
    verdict = 'writes <h1>';
  } else if (AS_H1.test(source)) {
    const caller = source.match(/<([A-Z][\w$]*)\b[^<>]*?\bas=(?:"h1"|'h1'|\{\s*['"]h1['"]\s*\})/);
    verdict = `${caller ? caller[1] : 'a component'} as="h1"`;
  } else {
    for (const [name, target] of readImports(source, file)) {
      if (!/^[A-Z]/.test(name)) continue;
      if (!new RegExp(`<${name}[\\s/>]`).test(source)) continue;

      const inner = await headingSource(target, visiting);
      if (inner) {
        verdict = `${name} → ${inner}`;
        break;
      }
    }
  }

  visiting.delete(file);
  verdicts.set(file, verdict);
  return verdict;
}

/* ------------------------------------------------------------------ *
 * The pages.
 * ------------------------------------------------------------------ */

async function collectPages(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  const pages = [];

  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...((await collectPages(full)) ?? []));
    else if (RENDERED_FILES.has(entry.name)) pages.push(full);
  }

  return pages;
}

/** The files Next renders as a whole page for a visitor. */
const RENDERED_FILES = new Set(['page.js', 'not-found.js', 'error.js']);

/** Writes no markup of its own and answers every request with `notFound()`. */
function onlyCallsNotFound(source) {
  return /\bnotFound\(\)/.test(source) && !/<[A-Za-z]/.test(source);
}

/** The `not-found.js` Next renders for a `notFound()` thrown in this file. */
function nearestNotFound(file) {
  for (let dir = dirname(file); dir.startsWith(PAGES_DIR); dir = dirname(dir)) {
    const candidate = join(dir, 'not-found.js');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function pageHeading(page) {
  if (!onlyCallsNotFound(await load(page))) return headingSource(page);

  const target = nearestNotFound(page);
  const inner = target ? await headingSource(target) : null;
  return inner ? `notFound() → ${display(target)} → ${inner}` : null;
}

const pages = await collectPages(PAGES_DIR);

if (pages === null || pages.length === 0) {
  console.error(
    '\nNo pages found under ' +
      display(PAGES_DIR) +
      '.\n' +
      'The public route tree has moved or been renamed. This check has to move\n' +
      'with it, or it silently passes while checking nothing.\n'
  );
  process.exit(2);
}

const results = [];

for (const page of pages) {
  results.push({ page: display(page), heading: await pageHeading(page) });
}

results.sort((a, b) => a.page.localeCompare(b.page));

const width = Math.max(...results.map((r) => r.page.length));
const failures = results.filter((r) => !r.heading);

console.log('\nPage headings');
console.log('  Every page under app/(site)/[locale]/ must render a top-level heading.\n');

for (const result of results) {
  console.log('  ' + result.page.padEnd(width + 2) + (result.heading ?? 'NO <h1>'));
}

if (failures.length > 0) {
  console.error('\n  ' + failures.length + ' page(s) render no <h1>:\n');

  for (const failure of failures) console.error('    ' + failure.page);

  console.error(
    '\n  Give the page one heading that says what it is — usually by asking the\n' +
      '  heading block for it:\n\n' +
      '    <SectionHeading as="h1">{dictionary.…}</SectionHeading>\n\n' +
      '  Change the tag, not the look: globals.css styles every heading level\n' +
      '  alike, but tracks headings where a paragraph is not tracked. A page with\n' +
      '  no <h1> is a WCAG 1.3.1 failure, Level A.\n'
  );

  process.exit(1);
}

console.log('\n  ' + results.length + ' public pages checked, each renders a top-level heading.\n');
