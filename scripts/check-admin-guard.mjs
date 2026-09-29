/**
 * Asserts that every page in the guarded trees actually calls the guard.
 *
 * THE TREES
 *
 *   app/(admin)/admin/(guarded)/  every admin page but the login form
 *   app/(dev)/                    the design system at /admin/dev. It has its
 *                                 own root layout (English, left-to-right), so it
 *                                 cannot sit in the admin group, and it is under
 *                                 /admin because the session cookie is scoped to
 *                                 that path: a guard anywhere else never sees one.
 *
 * Each tree must exist and hold at least one page; one that has moved exits 2
 * rather than passing while checking nothing.
 *
 * WHY THIS EXISTS
 *
 * The guard is called by each page rather than by a layout, and that is a
 * measured decision rather than a preference — a layout is handed
 * `{ children, params }` and nothing else, and `headers()` carries no path on a
 * document request, so a layout guard cannot know which page was asked for and
 * can only ever return people to the dashboard. Landing back where you started
 * is a requirement, so the check lives where the path is known.
 *
 * The cost of that is a page could be added without it, and would then render
 * to anybody. This script is what stops that being a thing anyone has to
 * remember. It is the same shape as scripts/check-contrast.mjs: no
 * dependencies, run by `npm run lint`, prints a table either way.
 *
 * Exit codes: 0 every guarded page calls the guard, 1 one does not,
 * 2 a guarded tree is missing or empty, which means the structure moved and this
 * script needs to move with it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const GUARDED_DIRS = [
  join(process.cwd(), 'app', '(admin)', 'admin', '(guarded)'),
  join(process.cwd(), 'app', '(dev)'),
];

/** The call every page in that tree must make. */
const REQUIRED_CALL = 'requireAdminSession(';

/** Where the guard is imported from, so a look-alike local function fails. */
const REQUIRED_IMPORT = '@/lib/auth/admin-guard';

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

    if (entry.isDirectory()) {
      const nested = await collectPages(full);
      if (nested) pages.push(...nested);
    } else if (entry.name === 'page.js') {
      pages.push(full);
    }
  }

  return pages;
}

const pages = [];

for (const directory of GUARDED_DIRS) {
  const found = await collectPages(directory);
  const name = relative(process.cwd(), directory).split(sep).join('/');

  if (found === null) {
    console.error(
      '\nCannot find ' + name + '.\n' +
        'A guarded tree has moved or been renamed. This check has to move\n' +
        'with it, or it silently passes while guarding nothing.\n'
    );
    process.exit(2);
  }

  if (found.length === 0) {
    console.error('\nNo pages found in ' + name + '.\n');
    process.exit(2);
  }

  pages.push(...found);
}

const results = [];

for (const page of pages) {
  const source = await readFile(page, 'utf8');

  results.push({
    page: relative(process.cwd(), page).split(sep).join('/'),
    calls: source.includes(REQUIRED_CALL),
    imports: source.includes(REQUIRED_IMPORT),
  });
}

results.sort((a, b) => a.page.localeCompare(b.page));

const width = Math.max(...results.map((r) => r.page.length));
const failures = results.filter((r) => !r.calls || !r.imports);

console.log('\nAdmin guard');
console.log(
  '  Every page under app/(admin)/admin/(guarded)/ and app/(dev)/ must call requireAdminSession().\n'
);

for (const result of results) {
  const status = result.calls && result.imports ? 'guarded' : 'UNGUARDED';
  console.log('  ' + result.page.padEnd(width + 2) + status);
}

if (failures.length > 0) {
  console.error('\n  ' + failures.length + ' page(s) in a guarded tree do not call the guard:\n');

  for (const failure of failures) {
    const reason = !failure.imports
      ? 'does not import ' + REQUIRED_IMPORT
      : 'imports the guard but never calls ' + REQUIRED_CALL + ')';
    console.error('    ' + failure.page + ' — ' + reason);
  }

  console.error(
    '\n  Add this as the first statement of the page component, passing the\n' +
      '  path the page lives at so signing in returns to it:\n\n' +
      "    await requireAdminSession('/admin/…');\n\n" +
      '  A page here without it renders in full to anyone who types its URL.\n'
  );

  process.exit(1);
}

console.log(
  '\n  ' + results.length + ' guarded pages checked, all call the guard.\n'
);
