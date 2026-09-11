// Run what CI runs, here, without GitHub.
//
//   node scripts/ci-local.mjs
//
// It does exactly what .github/workflows/ci.yml does, in the same order:
// a clean checkout, npm ci from the lockfile, npm test, preflight, acceptance.
// It does it on every Node version the workflow names, fetching one if it is
// not installed.
//
// The clean checkout is the point. Running the suite in the working directory
// proves it passes with whatever happens to be lying around: an uncommitted
// file, a stale build, a dependency installed by hand months ago. Cloning from
// the local git repository into an empty folder and installing from the
// lockfile removes all three, which is most of what a CI runner gives you.
//
// What this cannot do is Linux and macOS. The packaging defects this project
// has produced were platform-specific, so the operating system matrix on
// GitHub is not redundant with this. It is the last mile.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const win = process.platform === 'win32';
const NODE_VERSIONS = [20, 22];

// The Node binary for a version, fetched through npx when it is not this one.
function nodeFor(version) {
  if (process.version.startsWith(`v${version}.`)) return process.execPath;
  // A bare command name goes through a shell on Windows because npx is a .cmd;
  // an absolute path never does, because a shell mangles the spaces in it.
  const r = spawnSync('npx', ['-y', '-p', `node@${version}`, 'node', '-p', 'process.execPath'], { encoding: 'utf8', shell: win });
  const path = (r.stdout ?? '').trim().split('\n').pop();
  if (!path || r.status !== 0) throw new Error(`could not obtain Node ${version}: ${(r.stderr ?? '').slice(-200)}`);
  return path;
}

// Two rules on Windows, and they conflict, so each command picks the right one.
// npm is a .cmd and only runs through a shell. An absolute Node path contains a
// space, as every default install does, and a shell splits it at the space. So:
// bare names get a shell, absolute paths never do.
function step(cwd, exe, args, label, env) {
  process.stdout.write(`    ${label} ... `);
  const started = Date.now();
  const shell = win && !/[\\/]/.test(exe);
  const r = spawnSync(exe, args, { cwd, encoding: 'utf8', shell, env: { ...process.env, ...env } });
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (r.status === 0) {
    console.log(`ok (${secs}s)`);
    return true;
  }
  console.log(`FAILED (${secs}s)`);
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-18).join('\n');
  console.log(output.replace(/^/gm, '      '));
  return false;
}

// Refuse to pretend: a dirty tree means the clone is not what was committed.
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
if (dirty) {
  console.log('\nUncommitted changes. A clean checkout would not contain them, so this would test\nsomething other than what CI will see. Commit first, or accept that this run is a lie:\n');
  console.log(dirty.replace(/^/gm, '  '));
  process.exit(1);
}

const sandbox = mkdtempSync(join(tmpdir(), 'billing-doctor-ci-'));
const checkout = join(sandbox, 'checkout');
let failed = 0;
try {
  console.log('\nlocal CI: a clean checkout, installed from the lockfile\n');
  execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${root.replace(/\\/g, '/')}`, checkout], { encoding: 'utf8' });
  console.log(`  cloned ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim()} into a temporary directory`);

  for (const version of NODE_VERSIONS) {
    const exe = nodeFor(version);
    const actual = spawnSync(exe, ['--version'], { encoding: 'utf8' }).stdout.trim();
    console.log(`\n  Node ${version} (${actual})`);
    // Put this Node first on PATH so npm, and everything npm spawns, runs on the
    // version being tested rather than on whichever one is installed globally.
    const env = { PATH: `${join(exe, '..')}${win ? ';' : ':'}${process.env.PATH}` };
    const npm = 'npm';
    if (!step(checkout, npm, ['ci', '--no-audit', '--no-fund'], 'npm ci', env)) { failed += 1; continue; }
    // Through npm, not `node --run`, because `--run` does not exist before Node
    // 22 and because the npm script itself is a thing that can be broken.
    if (!step(checkout, npm, ['test'], 'npm test', env)) failed += 1;
    if (!step(checkout, exe, ['scripts/preflight.mjs'], 'preflight', env)) failed += 1;
    if (!step(checkout, exe, ['scripts/acceptance.mjs'], 'acceptance', env)) failed += 1;
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

if (failed) {
  console.log(`\n${failed} step(s) failed. GitHub would be red for the same reason.\n`);
  process.exit(1);
}
console.log('\nEverything CI runs passes here, on every Node version it names.');
console.log('Still only this operating system. Linux and macOS are what the GitHub matrix adds.\n');
