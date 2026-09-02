/**
 * Asserts that the sitemap offers every finished public page and no stub.
 *
 * WHY THIS EXISTS
 *
 * The sitemap listed the whole locked route map, six entries of which were
 * still `StubPage` renders — so the first deployment would have handed Google
 * six placeholder pages, and thin content indexed early is expensive to undo.
 *
 * Deleting those six fixes today and not tomorrow. The next page finished is
 * one somebody has to remember to add, and the next stub added is one somebody
 * has to remember to keep out; both are the kind of thing that gets forgotten
 * exactly once and then sits there. So the lists are declared in
 * lib/public-routes.js and this script holds them against what is on disk.
 *
 * THE INVARIANT
 *
 *   Every page.js under app/(site)/[locale]/ is exactly one of three things:
 *   a stub, a deliberate exclusion, or listed in the sitemap.
 *
 * Which closes both directions. A stub in INDEXABLE_PATHS fails. A finished
 * page in none of the three lists fails. Nobody has to remember either half.
 *
 * "Stub" is not a judgement call: it is whether the page renders
 * components/ui/StubPage, which is the component every scaffolded page here
 * already shares. A page stops being a stub by no longer importing it, which is
 * the same act as building the page.
 *
 * Same shape as the other two guards: no dependencies, run by `npm run lint`,
 * prints a table either way, and — like them — advisory rather than part of the
 * build. That is a real limitation and worth knowing: nothing stops a stub
 * shipping in the sitemap except somebody running this.
 *
 * Exit codes: 0 all as declared, 1 a page is misfiled, 2 the public route tree
 * is missing, which means the structure moved and this script must move with it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE_DIR = join(process.cwd(), 'app', '(site)', '[locale]');

/** What makes a page a stub rather than a page. */
const STUB_IMPORT = '@/components/ui/StubPage';

/*
  Imported rather than re-declared, so this cannot drift from what the sitemap
  actually emits. lib/public-routes.js is deliberately free of `@/` aliases and
  of every framework import so that plain Node can load it.
*/
const routesModule = join(process.cwd(), 'lib', 'public-routes.js');
const { INDEXABLE_PATHS, GENERATED_PATHS, EXCLUDED_PATHS } = await import(
  pathToFileURL(routesModule).href
);

/** Every page.js under the public locale tree, as a route path. */
async function collectRoutes(directory, segments = []) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  const routes = [];

  for (const entry of entries) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      const nested = await collectRoutes(full, [...segments, entry.name]);
      if (nested) routes.push(...nested);
    } else if (entry.name === 'page.js') {
      routes.push({
        file: relative(process.cwd(), full).split(sep).join('/'),
        path: '/' + segments.join('/'),
      });
    }
  }

  return routes;
}

const found = await collectRoutes(SITE_DIR);

if (found === null || found.length === 0) {
  console.error(
    '\nCannot find pages under ' +
      relative(process.cwd(), SITE_DIR).split(sep).join('/') +
      '.\n' +
      'The public route tree has moved or been renamed. This check has to move\n' +
      'with it, or it silently passes while checking nothing.\n'
  );
  process.exit(2);
}

const routes = [];

for (const route of found) {
  const source = await readFile(join(process.cwd(), route.file), 'utf8');
  const isStub = source.includes(STUB_IMPORT);

  const listed = INDEXABLE_PATHS.includes(route.path);
  const generated = GENERATED_PATHS.includes(route.path);
  const excluded = EXCLUDED_PATHS.includes(route.path);

  let verdict;
  let problem = null;

  if (isStub && listed) {
    verdict = 'STUB, LISTED';
    problem =
      'is a stub and is in INDEXABLE_PATHS — it would be offered to search engines';
  } else if (excluded) {
    /*
      Checked before the stub case on purpose. Being excluded is a permanent
      decision about the route; being a stub is a fact about today. The purchase
      flow is both, and the decision is the more useful thing to print — when
      the cart is built, nothing about this row should change.
    */
    verdict = 'excluded on purpose';
  } else if (generated) {
    verdict = 'generated per record';
  } else if (isStub) {
    verdict = 'stub, not listed';
  } else if (listed) {
    verdict = 'listed';
  } else {
    verdict = 'BUILT, UNDECLARED';
    problem =
      'is a finished page in none of the three lists — it is missing from the '
      + 'sitemap, and nothing here says that was deliberate';
  }

  routes.push({ ...route, verdict, problem });
}

/* A declared path with no page behind it is the third way to be wrong. */
const declared = [...INDEXABLE_PATHS, ...GENERATED_PATHS, ...EXCLUDED_PATHS];
const orphans = declared.filter((path) => !routes.some((route) => route.path === path));

routes.sort((a, b) => a.path.localeCompare(b.path));

const width = Math.max(...routes.map((r) => r.path.length));

console.log('\nSitemap routes');
console.log('  Every public page is a stub, an exclusion, or in the sitemap.\n');

for (const route of routes) {
  console.log('  ' + route.path.padEnd(width + 2) + route.verdict);
}

const failures = routes.filter((route) => route.problem);

if (failures.length > 0 || orphans.length > 0) {
  console.error('');

  for (const failure of failures) {
    console.error('  ' + failure.file + '\n    ' + failure.path + ' ' + failure.problem);
  }

  for (const orphan of orphans) {
    console.error(
      '  lib/public-routes.js\n    ' +
        orphan +
        ' is declared but no page.js answers to it'
    );
  }

  console.error(
    '\n  Fix it in lib/public-routes.js: a finished page joins INDEXABLE_PATHS,\n' +
      '  a page that must never be indexed joins EXCLUDED_PATHS with the reason,\n' +
      '  and a stub belongs in neither until it stops rendering StubPage.\n'
  );

  process.exit(1);
}

const count = (verdict) => routes.filter((route) => route.verdict === verdict).length;

console.log(
  '\n  ' +
    routes.length +
    ' public pages checked: ' +
    count('listed') +
    ' listed, ' +
    count('generated per record') +
    ' generated per record, ' +
    count('stub, not listed') +
    ' still stubs, ' +
    count('excluded on purpose') +
    ' excluded on purpose.\n'
);
