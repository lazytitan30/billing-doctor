// Everything that must be true before a version goes to npm, checked by a
// machine so it cannot be skipped.
//
//   node scripts/preflight.mjs
//
// A publish is permanent. A version can be deprecated but never replaced, and
// the files inside it are public forever. Each check below exists because
// getting it wrong would have shipped something that could not be taken back.
//
// Run it, read the summary, and only then publish.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const failures = [];
const notes = [];
function check(label, ok, detail = '') {
  if (ok) {
    notes.push(`  ok    ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failures.push(`  FAIL  ${label}${detail ? `  ${detail}` : ''}`);
  }
}

// ---- 1. One version, everywhere it is written down ------------------------

const pkg = json('package.json');
const version = pkg.version;
const manifests = {
  'server.json': json('server.json').version,
  'server.json packages[0]': json('server.json').packages?.[0]?.version,
  'gemini-extension.json': json('gemini-extension.json').version,
  '.claude-plugin/plugin.json': json('.claude-plugin/plugin.json').version,
};
for (const [where, found] of Object.entries(manifests)) {
  check(`version in ${where}`, found === version, `${found} vs ${version}`);
}

// ---- 2. The changelog is dated, and names this version --------------------
// It ships inside the package, so "unreleased" would be permanently wrong.

const changelogHead = read('CHANGELOG.md').split('\n').find((l) => l.startsWith('## '));
check('changelog names this version', changelogHead?.includes(version), changelogHead ?? 'no heading');
check('changelog is dated, not "unreleased"', /\(\d{4}-\d{2}-\d{2}\)/.test(changelogHead ?? ''), changelogHead ?? '');

// ---- 3. The rule count in prose matches the catalogue --------------------
// Every sweep has moved this number, and it appears in six places.

const catalogue = await import(new URL('../dist/engine/catalogue.js', import.meta.url));
const ruleCount = catalogue.RULES.length;
const ids = catalogue.RULES.map((r) => r.id);
check('no duplicate rule ids', new Set(ids).size === ids.length, `${ids.length} rules`);

const prose = ['README.md', 'CHANGELOG.md', 'GEMINI.md', 'docs/index.md'];
for (const file of prose) {
  const text = read(file);
  const claims = [...text.matchAll(/\b(\d{2,3})[- ](?:rules?\b|rule catalogue|in eleven|in ten)/g)].map((m) => Number(m[1]));
  const wrong = claims.filter((n) => n !== ruleCount);
  check(`rule count in ${file}`, wrong.length === 0, wrong.length ? `claims ${[...new Set(wrong)].join(', ')}, catalogue has ${ruleCount}` : `${ruleCount}`);
}

// ---- 4. Every rule has its Google fact and its fixture -------------------
// A rule without a documentation quote does not ship. A rule without a fixture
// has never been proven to fire.

const docs = await import(new URL('../dist/google/docs.js', import.meta.url));
const missingFact = ids.filter((id) => !docs.GOOGLE_RULES[id]);
check('every rule has a Google fact', missingFact.length === 0, missingFact.join(', '));

const fixtureIds = new Set(
  readdirSync(join(root, 'fixtures/rules'))
    .filter((n) => n.endsWith('.json') && !n.endsWith('.expected.json'))
    .map((n) => n.split('-')[0]),
);
const missingFixture = ids.filter((id) => !fixtureIds.has(id));
check('every rule has a fixture', missingFixture.length === 0, missingFixture.join(', '));

// ---- 5. The five correct lifecycles stay silent --------------------------
// A false positive is a release blocker. This is the one that protects users
// from being sent to look for a fault they do not have.

const { parseTimeline } = await import(new URL('../dist/engine/timeline.js', import.meta.url));
const { diagnose } = await import(new URL('../dist/engine/diagnose.js', import.meta.url));
const cleanDir = join(root, 'fixtures/clean');
const noisy = [];
for (const name of readdirSync(cleanDir).filter((n) => n.endsWith('.json'))) {
  const parsed = parseTimeline(readFileSync(join(cleanDir, name), 'utf8'));
  const found = parsed.ok ? diagnose(parsed.timeline).findings : [{ ruleId: 'PARSE' }];
  if (found.length) noisy.push(`${name}: ${found.map((f) => f.ruleId).join(',')}`);
}
check('clean lifecycles produce nothing', noisy.length === 0, noisy.join(' | '));

// ---- 6. Internal documentation links resolve ----------------------------

const broken = [];
for (const file of ['README.md', ...readdirSync(join(root, 'docs')).filter((n) => n.endsWith('.md')).map((n) => `docs/${n}`)]) {
  for (const m of read(file).matchAll(/\]\((?!https?:)([^)#]+\.md)(?:#[^)]*)?\)/g)) {
    const target = resolve(join(root, dirname(file)), m[1]);
    if (!existsSync(target)) broken.push(`${file} -> ${m[1]}`);
  }
}
check('internal doc links resolve', broken.length === 0, broken.join(' | '));

// ---- 7. What the tarball actually contains ------------------------------
// Source, tests and anything secret must not be in it.

const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }));
const files = packed[0].files.map((f) => f.path);
const forbidden = files.filter((f) => /^(src|tests|node_modules)\//.test(f) || /(^|\/)\.env|\.npmrc$/.test(f));
check('no source, tests or secrets in the tarball', forbidden.length === 0, forbidden.slice(0, 5).join(', '));
check('tarball carries the compiled entry point', files.includes('dist/cli.js') && files.includes('dist/index.js'));
check('tarball carries the licence', files.includes('LICENSE'));
check('tarball size is sane', packed[0].size < 5_000_000, `${Math.round(packed[0].size / 1000)} kB, ${files.length} files`);

// ---- 7b. The bin must run on macOS and Linux when built on Windows --------
// The kernel hands `#!/usr/bin/env node\r` to env as a program called "node\r"
// and every npx on a Mac dies with "No such file or directory". CI cannot see
// this: it compiles on Linux. tsc writes LF here only because tsconfig says
// newLine=lf; this is what notices if that ever changes.

const cliBytes = readFileSync(join(root, 'dist/cli.js'));
const shebang = cliBytes.subarray(0, Math.max(0, cliBytes.indexOf(10))).toString();
check('bin starts with a LF-terminated node shebang', shebang === '#!/usr/bin/env node', JSON.stringify(shebang));
const crFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (readFileSync(full).includes(13)) crFiles.push(full.slice(root.length));
  }
})(join(root, 'dist'));
check('no CR bytes anywhere in the compiled output', crFiles.length === 0, crFiles.slice(0, 3).join(', '));

// ---- 8. The MCP ownership marker the registry checks ---------------------
// If this is missing, the registry refuses the server and the only fix is to
// publish another version.

check('package.json carries mcpName', Boolean(pkg.mcpName), pkg.mcpName ?? 'missing');
check('mcpName matches server.json name', pkg.mcpName === json('server.json').name, json('server.json').name);
// The registry caps description at 100 characters and refuses the publish
// otherwise. It refused ours on 2026-09-13; a check here costs nothing.
const serverDescription = json('server.json').description ?? '';
check('server.json description fits the registry limit', serverDescription.length <= 100, `${serverDescription.length} chars`);

// ---- Report --------------------------------------------------------------

console.log(`\npreflight for ${pkg.name}@${version}\n`);
for (const line of notes) console.log(line);
if (failures.length) {
  console.log('');
  for (const line of failures) console.log(line);
  console.log(`\n${failures.length} check(s) failed. Do not publish.\n`);
  process.exit(1);
}
console.log(`\nAll ${notes.length} checks passed.`);
console.log('Still done by hand, because they need another machine or a person:');
console.log('  - npm test on the engine floor in package.json engines.node');
console.log('  - install the tarball in an empty directory and run every command');
console.log('  - read the diff since the last release\n');
