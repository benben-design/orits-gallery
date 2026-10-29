/**
 * Asserts two things about the locale files: that every one of them holds the
 * same keys, and that every key is read by something.
 *
 * WHY THIS EXISTS
 *
 * The checkout's rejected-field sentence, `checkout.errorRequired`, was
 * written, translated, sat in both locale files — and was rendered by nothing
 * until 17-09-2026. The failure it stood for was the silent one: a buyer
 * pressing pay, the form refusing, and nothing announcing that anything had
 * happened. A string that exists usually means somebody decided a person needs
 * to be told something; one that nothing renders is that decision quietly not
 * carried out, and no page looks wrong because of it.
 *
 * Parity is the cheap half. i18n.md requires both files to hold the same key
 * set, and a translation flow that drops a key on one side renders a blank for
 * one language only — which is the language the person checking is not
 * reading.
 *
 * THE TRAP THIS IS BUILT AROUND
 *
 * Whole families of strings are never written by name. Status, category,
 * medium, sale channel, error codes and outcomes are all indexed by a value
 * that only exists at runtime — `dictionary.status[work.status]` — so a search
 * for each full key path declares them dead, and the first thing anyone does
 * about a guard that cries wolf is weaken it. So a computed lookup counts as
 * reading what it can reach, which is decided in this order:
 *
 *   1. **The key names the same file spells out for it**, when the lookup is
 *      indexed by a key name rather than by data. `copy[field.labelKey]` reads
 *      only what FIELD_ORDER spells out as `labelKey: 'addressStreet'`, and
 *      ArtworkDetail's alt-text lookup only the templates in
 *      ALT_TEMPLATE_BY_TYPE. Without this rule those two lookups would count
 *      the entire checkout and artwork slices as read, and the guard would be
 *      blind in exactly the slice it was written for. See `reachableKeys` for
 *      the two shapes that qualify, and why nothing looser does.
 *   2. **Otherwise the whole prefix that is written** — `dictionary.status`
 *      counts every status. That is a table indexed by data, every entry in it
 *      can be reached, and data can arrive from anywhere.
 *
 * Every computed lookup is printed with how it was counted, so the rule can be
 * audited rather than trusted.
 *
 * HOW A READ IS FOUND
 *
 * The dictionary rarely travels under one name. It follows it through:
 *
 *   - `dictionary`, everywhere, and anything assigned from `getDictionary()`;
 *   - an alias — `const copy = dictionary.checkout`, and destructuring;
 *   - a slice handed to another component as a prop, in any file —
 *     `labels={dictionary.admin.workForm}` makes `labels.x` in
 *     AdminWorkForm.js a read of `admin.workForm.x`;
 *   - a name destructured from a function of ours — `const { notFound } =
 *     useFallback()` takes whatever `notFound` was bound to in the file that
 *     defines `useFallback`, which is how the 404 and error pages' copy is
 *     followed through the layout's context.
 *
 * A slice being handed on is **not** a read. The layout passes `cart` to the
 * drawer whole, and counting that would mark every cart string used; what the
 * drawer then reads is what counts. Calling an array method on a list of
 * strings — `promises.items.map(…)` — reads the whole list.
 *
 * What it cannot see: a slice passed as an argument to a plain function rather
 * than as a prop, and two different things sharing one name in one file (an
 * order record called `order` beside a dictionary slice called `order`) can
 * make an unread key look read. Both err towards passing, never towards
 * deleting a string that renders.
 *
 * Same shape as the other guards: no dependencies, run by `npm run lint`,
 * prints what it found either way.
 *
 * Exit codes: 0 all symmetrical and all read, 1 a key is missing from a locale
 * file or read by nothing, 2 the locale files or the source directories have
 * moved and this script needs to move with them.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const LOCALES_DIR = join(ROOT, 'lib', 'i18n', 'locales');
const SOURCE_DIRS = ['app', 'components', 'lib'].map((dir) => join(ROOT, dir));

/** The prop name every component here receives the dictionary under. */
const DICTIONARY_NAME = 'dictionary';

/** Calling one of these on a list of strings reads the whole list. */
const ARRAY_READS = new Set([
  'map', 'forEach', 'filter', 'find', 'some', 'every', 'reduce', 'join',
  'slice', 'at', 'entries', 'keys', 'values', 'length', 'flatMap',
]);

const display = (file) => relative(ROOT, file).split(sep).join('/');
const joinPath = (base, key) => (base === '' ? String(key) : `${base}.${key}`);

/* ------------------------------------------------------------------ *
 * The locale files.
 * ------------------------------------------------------------------ */

const isNode = (value) => value !== null && typeof value === 'object';

function childOf(node, key) {
  if (Array.isArray(node)) return /^\d+$/.test(key) ? node[Number(key)] : undefined;
  return Object.hasOwn(node, key) ? node[key] : undefined;
}

function nodeAt(tree, path) {
  return path === '' ? tree : path.split('.').reduce((node, key) => (isNode(node) ? childOf(node, key) : undefined), tree);
}

function leavesOf(node, path = '', out = []) {
  if (!isNode(node)) out.push(path);
  else for (const key of Object.keys(node)) leavesOf(node[key], joinPath(path, key), out);
  return out;
}

/** Every locale file's keys merged, so a key on one side only is still checked. */
function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isNode(value)) {
      target[key] ??= Array.isArray(value) ? [] : {};
      merge(target[key], value);
    } else if (!(key in target)) {
      target[key] = value;
    }
  }
  return target;
}

let localeFiles = [];
try {
  localeFiles = (await readdir(LOCALES_DIR)).filter((name) => name.endsWith('.json')).sort();
} catch {
  // Reported below.
}

if (localeFiles.length === 0) {
  console.error(
    '\nNo locale files found in ' + display(LOCALES_DIR) + '.\n' +
      'They have moved or been renamed. This check has to move with them.\n'
  );
  process.exit(2);
}

const locales = [];
for (const name of localeFiles) {
  const tree = JSON.parse(await readFile(join(LOCALES_DIR, name), 'utf8'));
  locales.push({ name, tree, leaves: new Set(leavesOf(tree)) });
}

const tree = locales.reduce((merged, locale) => merge(merged, locale.tree), {});
const allLeaves = leavesOf(tree).sort();

/* ------------------------------------------------------------------ *
 * The source.
 * ------------------------------------------------------------------ */

/**
 * The source with comments removed — a comment naming `copy.errorRequired` is
 * exactly what outlives the code that rendered it. A line comment is only taken
 * from `//` that does not follow a colon, so the `https://` in a string stays.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function collectSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSources(full)));
    else if (/\.(m?js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

if (!SOURCE_DIRS.every((dir) => existsSync(dir))) {
  console.error('\nOne of app/, components/ or lib/ is missing. This check has to move with them.\n');
  process.exit(2);
}

const files = [];
for (const dir of SOURCE_DIRS) {
  for (const file of await collectSources(dir)) {
    files.push({ file, source: stripComments(await readFile(file, 'utf8')) });
  }
}

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

/** Every component name a file can render, mapped to the file defining it. */
function componentsIn({ file, source }) {
  const components = new Map();
  const pattern = /import\s+([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;

  for (const [, defaultName, named, specifier] of source.matchAll(pattern)) {
    const target = resolveImport(specifier, file);
    if (!target) continue;
    if (defaultName) components.set(defaultName, target);
    for (const part of (named ?? '').split(',')) {
      const local = part.trim().split(/\s+as\s+/).pop();
      if (local) components.set(local, target);
    }
  }

  for (const [, name] of source.matchAll(/\b(?:function|const)\s+([A-Z][\w$]*)\b/g)) {
    components.set(name, file);
  }

  return components;
}

/**
 * Reads a member chain starting at `index`, just past its head identifier:
 * `.a`, `?.a`, `['a']`, `[0]`, `[expr]`. Returns the segments and where the
 * chain ends.
 */
function readChain(source, index) {
  const segments = [];
  let i = index;

  for (;;) {
    const dot = /^\s*\??\.\s*([A-Za-z_$][\w$]*)/.exec(source.slice(i, i + 200));
    if (dot) {
      segments.push({ key: dot[1] });
      i += dot[0].length;
      continue;
    }

    const open = /^(\?\.)?\[/.exec(source.slice(i, i + 3));
    if (!open) break;

    let depth = 0;
    let j = i + open[0].length - 1;
    for (; j < source.length; j++) {
      if (source[j] === '[') depth++;
      else if (source[j] === ']' && --depth === 0) break;
    }

    const inner = source.slice(i + open[0].length, j).trim();
    const literal = /^(['"])([^'"]*)\1$/.exec(inner);
    if (literal) segments.push({ key: literal[2] });
    else if (/^\d+$/.test(inner)) segments.push({ key: inner });
    else segments.push({ computed: inner });
    i = j + 1;
  }

  return { segments, end: i };
}

/** Every occurrence of `name` as the head of an expression, with its chain. */
function chainsOf(source, name) {
  const head = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  return [...source.matchAll(head)].map((match) => ({
    at: match.index,
    ...readChain(source, match.index + name.length),
  }));
}

/**
 * Follows a chain from a binding into the tree as far as fixed keys go.
 * Returns where it stopped and why: at a string, on a node with nothing more
 * written, at a computed lookup, at an array method, or off the tree entirely.
 */
function walk(base, segments) {
  let path = base;
  let node = nodeAt(tree, base);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (segment.computed !== undefined) {
      return { stop: 'computed', path, node, expression: segment.computed };
    }

    const next = childOf(node, segment.key);
    if (next === undefined) {
      if (Array.isArray(node) && ARRAY_READS.has(segment.key)) return { stop: 'array', path, node };
      return { stop: 'off-tree' };
    }

    path = joinPath(path, segment.key);
    node = next;
    if (!isNode(node)) return { stop: 'leaf', path };
  }

  return { stop: 'node', path, node };
}

/* ------------------------------------------------------------------ *
 * Bindings: which names mean which slice, per file.
 * ------------------------------------------------------------------ */

const bindings = new Map(files.map(({ file }) => [file, new Map([[DICTIONARY_NAME, new Set([''])]])]));
let changed = true;

function bind(file, name, path) {
  const names = bindings.get(file);
  if (!names) return;
  if (!names.has(name)) names.set(name, new Set());
  if (!names.get(name).has(path)) {
    names.get(name).add(path);
    changed = true;
  }
}

/** The slices a chain written at `index` in this file stands for. */
function slicesAt(file, source, index) {
  const head = /^([A-Za-z_$][\w$]*)/.exec(source.slice(index));
  if (!head) return [];
  const bases = bindings.get(file).get(head[1]);
  if (!bases) return [];

  const { segments } = readChain(source, index + head[1].length);
  const slices = [];
  for (const base of bases) {
    const result = walk(base, segments);
    if (result.stop === 'node') slices.push(result.path);
  }
  return slices;
}

/** The balanced `{…}` expression starting at `index`, or null. */
function braced(source, index) {
  if (source[index] !== '{') return null;
  let depth = 0;
  for (let j = index; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) return { text: source.slice(index + 1, j), end: j };
  }
  return null;
}

const componentMaps = new Map(files.map((entry) => [entry.file, componentsIn(entry)]));

while (changed) {
  changed = false;

  for (const { file, source } of files) {
    // Anything assigned straight from getDictionary() is the whole dictionary.
    for (const [, name] of source.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?getDictionary\(/g)) {
      bind(file, name, '');
    }

    // const copy = dictionary.checkout;
    for (const match of source.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?(?=[\w$])/g)) {
      for (const slice of slicesAt(file, source, match.index + match[0].length)) bind(file, match[1], slice);
    }

    // const { login } = dictionary.admin;
    for (const match of source.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?=[\w$])/g)) {
      for (const slice of slicesAt(file, source, match.index + match[0].length)) {
        for (const part of match[1].split(',')) {
          const [key, local] = part.split('=')[0].split(':').map((s) => s.trim());
          if (!key) continue;
          const path = joinPath(slice, key);
          if (isNode(nodeAt(tree, path))) bind(file, local || key, path);
        }
      }
    }

    // const { notFound } = useFallback(); — a slice handed back by a function
    // of ours is whatever that name was bound to in the function's own file.
    // The not-found and error pages get their copy from the layout this way,
    // through a context, because Next gives neither of them props.
    const imported = componentMaps.get(file);
    for (const match of source.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*([\w$]+)\(/g)) {
      const origin = imported.get(match[2]);
      if (!origin || origin === file) continue;
      const originNames = bindings.get(origin);
      if (!originNames) continue;
      for (const part of match[1].split(',')) {
        const [key, local] = part.split('=')[0].split(':').map((s) => s.trim());
        for (const path of originNames.get(key) ?? []) bind(file, local || key, path);
      }
    }

    // <AdminWorkForm labels={dictionary.admin.workForm} … /> — the prop is
    // bound in whichever file defines the component.
    const components = componentMaps.get(file);
    for (const tag of source.matchAll(/<([A-Z][\w$]*)/g)) {
      const target = components.get(tag[1]);
      if (!target) continue;

      let i = tag.index + tag[0].length;
      while (i < source.length && source[i] !== '>') {
        const attribute = /^\s*([\w$]+)=/.exec(source.slice(i, i + 80));
        if (attribute) {
          const value = braced(source, i + attribute[0].length);
          if (value) {
            const expression = value.text.trim();
            const offset = source.indexOf(expression, i + attribute[0].length);
            if (/^[\w$]+(\s*\??\.\s*[\w$]+|\[[^\]]*\])*$/.test(expression)) {
              for (const slice of slicesAt(file, source, offset)) bind(target, attribute[1], slice);
            }
            i = value.end + 1;
            continue;
          }
          i += attribute[0].length;
          continue;
        }
        const skip = braced(source, i);
        i = skip ? skip.end + 1 : i + 1;
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Reads.
 * ------------------------------------------------------------------ */

const read = new Set();
const lookups = [];

function readSubtree(path) {
  for (const leaf of leavesOf(nodeAt(tree, path), path)) read.add(leaf);
}

/**
 * Which keys of `node` a computed lookup can reach, when the file itself says —
 * or null when it is indexed by a value and can reach any of them.
 *
 * Only two shapes count as the file saying, and both name dictionary keys
 * rather than data:
 *
 *   - a property whose name says it holds a key — `copy[field.labelKey]` reads
 *     the `labelKey: '…'` values written in this file;
 *   - a constant map declared in this file — `artwork[ALT_TEMPLATE_BY_TYPE[…]
 *     ?? 'imageAlt']` reads that map's values and the fallback.
 *
 * Anything else is indexed by data, and data can come from anywhere. This is
 * narrower than "any key the file happens to write as a string" on purpose:
 * AdminImageUpload writes five of its error codes itself and receives the
 * other four from the server through the same `labels.errors[error.code]`, and
 * the looser rule declared those four dead while they render.
 */
function reachableKeys(source, expression, node) {
  const keys = Object.keys(node);
  const plain = expression.replace(/\?\./g, '.');

  const keyProperty = /\.\s*([\w$]*Key)\s*$/.exec(plain);
  if (keyProperty) {
    const pattern = new RegExp(`\\b${keyProperty[1]}\\s*:\\s*(['"])([\\w-]+)\\1`, 'g');
    const values = new Set([...source.matchAll(pattern)].map((m) => m[2]));
    return keys.filter((key) => values.has(key));
  }

  const map = /^([A-Z][\w$]*)\s*\[/.exec(plain);
  const declared = map && new RegExp(`\\bconst\\s+${map[1]}\\s*=\\s*\\{([^}]*)\\}`).exec(source);
  if (declared) {
    const values = new Set(
      [...declared[1].matchAll(/:\s*(['"])([\w-]+)\1/g), ...plain.matchAll(/(['"])([\w-]+)\1/g)].map((m) => m[2])
    );
    return keys.filter((key) => values.has(key));
  }

  return null;
}

for (const { file, source } of files) {
  for (const [name, bases] of bindings.get(file)) {
    for (const chain of chainsOf(source, name)) {
      for (const base of bases) {
        const result = walk(base, chain.segments);

        if (result.stop === 'leaf') read.add(result.path);
        else if (result.stop === 'array') readSubtree(result.path);
        else if (result.stop === 'computed') {
          // A named lookup that names no key reads nothing, rather than
          // everything: a lookup table with a typo in it should surface.
          const keys = reachableKeys(source, result.expression, result.node);
          if (keys) keys.forEach((key) => readSubtree(joinPath(result.path, key)));
          else readSubtree(result.path);

          lookups.push({
            file: display(file),
            lookup: `${result.path || '(root)'}[${result.expression}]`,
            counted: keys ? keys.join(', ') || 'NO KEY IT NAMES EXISTS' : 'every key',
          });
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Report.
 * ------------------------------------------------------------------ */

let failed = false;

console.log('\nLocale strings');
console.log('  Every locale file holds the same keys, and every key is read by something.\n');

console.log('  Parity');
for (const locale of locales) {
  const missing = allLeaves.filter((leaf) => !locale.leaves.has(leaf));
  console.log('    ' + locale.name.padEnd(10) + String(locale.leaves.size).padStart(4) + ' strings' +
    (missing.length ? `, ${missing.length} MISSING` : ''));
  if (missing.length) {
    failed = true;
    for (const leaf of missing) console.error('      missing: ' + leaf);
  }
}

console.log('\n  Computed lookups, and what each was counted as reading');
const uniqueLookups = [...new Map(lookups.map((l) => [`${l.file} ${l.lookup}`, l])).values()]
  .sort((a, b) => a.lookup.localeCompare(b.lookup) || a.file.localeCompare(b.file));
const lookupWidth = Math.max(...uniqueLookups.map((l) => l.lookup.length));
for (const lookup of uniqueLookups) {
  console.log('    ' + lookup.lookup.padEnd(lookupWidth + 2) + lookup.counted.padEnd(18) + '  ' + lookup.file);
}

const unread = allLeaves.filter((leaf) => !read.has(leaf));
console.log('\n  Usage');
console.log(`    ${allLeaves.length - unread.length} of ${allLeaves.length} strings are read.`);

if (unread.length > 0) {
  failed = true;
  console.error('\n  ' + unread.length + ' string(s) are read by nothing:\n');
  for (const leaf of unread) console.error('    ' + leaf);
  console.error(
    '\n  Render it, or delete it from every locale file. Do not loosen this check\n' +
      '  to make it pass: a string nothing renders is usually a sentence somebody\n' +
      '  decided a person needed to read, and that decision was never carried out.\n'
  );
}

if (failed) process.exit(1);

console.log('\n  ' + locales.length + ' locale files symmetrical, every string read.\n');
