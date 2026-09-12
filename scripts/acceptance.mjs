// Install the packed tarball into an empty directory and use it the way a
// stranger does. Nothing here touches the source tree.
//
//   node scripts/acceptance.mjs
//
// Why this exists. Every defect this project has shipped or nearly shipped was
// invisible to the unit tests, which were green throughout:
//
//   - the kit zip used Windows path separators and would not open on a Mac
//   - the changelog said "unreleased" and would have said so forever
//   - `npm test` had never run anywhere, because the glob it used is not
//     expanded by Node 20 and the quotes stopped the shell expanding it
//
// A unit test proves the code does what its author meant. It cannot prove the
// author meant the right thing, that the package contains what it should, or
// that the commands in the README work when typed. Only using the built
// artifact can. So this runs last, against the thing that would actually be
// published, and CI runs it on every push.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const win = process.platform === 'win32';
const failures = [];
const passes = [];

function check(label, ok, detail = '') {
  (ok ? passes : failures).push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

// Run a command in the sandbox and return its output and exit code, never throwing.
// Both streams, whether the command succeeded or not. A warning printed to
// stderr on a successful run is still something a user sees, so a check that
// reads only stdout would miss it.
function run(cwd, cmd, args, input) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', input, shell: win });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const sandbox = mkdtempSync(join(tmpdir(), 'billing-doctor-acceptance-'));
try {
  // 1. Build the artifact that would be published, and install only that.
  const packed = execFileSync('npm', ['pack', '--pack-destination', sandbox, '--json'], { cwd: root, encoding: 'utf8', shell: win });
  const tarball = join(sandbox, JSON.parse(packed)[0].filename);
  writeFileSync(join(sandbox, 'package.json'), JSON.stringify({ name: 'acceptance', private: true }));
  const install = run(sandbox, 'npm', ['install', '--no-audit', '--no-fund', tarball]);
  check('the packed tarball installs into an empty project', install.code === 0, install.code === 0 ? '' : install.out.slice(-200));

  const bin = join(sandbox, 'node_modules', '.bin', 'billing-doctor');
  const pkgDir = join(sandbox, 'node_modules', 'billing-doctor');
  const fixture = (p) => join(pkgDir, 'fixtures', p);
  const cli = (...args) => run(sandbox, bin, args);

  // 2. The commands the documentation promises, run as documented.
  const ruleCount = (await import(new URL('../dist/engine/catalogue.js', import.meta.url))).RULES.length;

  const rules = cli('rules');
  check('rules lists the catalogue', rules.code === 0 && rules.out.includes(`${ruleCount} rules`), rules.out.trim().split('\n').pop());

  const one = cli('rule', 'B1');
  check('rule <id> prints a rule with its Google quote', one.code === 0 && /Google's rule/.test(one.out));

  // The README names this exact file. If it stops shipping, the first thing a
  // reader types fails.
  const readmeExample = cli('diagnose', fixture('rules/G2-void-then-active.json'));
  check('the diagnose example from the README works', readmeExample.code === 1 && /G2/.test(readmeExample.out), `exit ${readmeExample.code}`);

  const clean = cli('diagnose', fixture('clean/01-purchase-renew-cancel-expire.json'));
  check('a correct lifecycle exits 0 and finds nothing', clean.code === 0 && /no findings|0 finding/i.test(clean.out), `exit ${clean.code}`);

  const validate = cli('validate', fixture('clean/01-purchase-renew-cancel-expire.json'));
  check('validate accepts a good timeline', validate.code === 0 && /valid/.test(validate.out));

  const state = cli('state', fixture('subscriptions/on-hold.json'));
  check('state explains a resource', state.code === 0 && /ON_HOLD/.test(state.out));

  const rtdnBody = JSON.stringify({
    message: {
      data: Buffer.from(JSON.stringify({
        version: '1.0',
        packageName: 'com.example.app',
        eventTimeMillis: '1700000000000',
        subscriptionNotification: { version: '1.0', notificationType: 4, purchaseToken: 'tok_abc123', subscriptionId: 'basic_monthly' },
      })).toString('base64'),
      messageId: 'm-1',
    },
  });
  const rtdn = run(sandbox, bin, ['rtdn', '-'], rtdnBody);
  check('rtdn decodes a Pub/Sub push body', rtdn.code === 0 && /SUBSCRIPTION_PURCHASED/.test(rtdn.out));

  // Redaction is the promise that makes it safe to share a timeline at all.
  // A purchase token belongs in this sample above everything else. It is the
  // bearer credential the tool exists to keep out of shared files, and until
  // 2026-09-12 this check tested an OAuth token, an email and an order id, and
  // no purchase token at all. redact walked straight past the project's own
  // fixture while reporting "redacted 0 tokens".
  const purchaseToken = 'kjhgfdsa.AO-J1OyExampleRealLookingTokenValue0123456789abcdefghijkl';
  const secret = [
    `token ${purchaseToken}`,
    'auth ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'mail dev@example.com',
    'order GPA.1234-5678-9012-34567',
    'authorization: bearer abcdefghijklmnopqrstuvwxyz012345',
    'account 550e8400e29b41d4a716446655440000',
  ].join(' ');
  const redact = run(sandbox, bin, ['redact'], secret);
  check('redact removes a purchase token', redact.code === 0 && !redact.out.includes(purchaseToken));
  check('redact counts the token it removed', /[1-9]\d* token/.test(redact.out));
  check('redact removes an OAuth token', !redact.out.includes('ya29.a0AfH6SMB'));
  check('redact removes an email', !redact.out.includes('dev@example.com'));
  check('redact masks an order id', !redact.out.includes('GPA.1234-5678-9012-34567'));
  check('redact removes a lowercase bearer token', !redact.out.includes('abcdefghijklmnopqrstuvwxyz012345'));
  check('redact removes a bare 32-hex account id', !redact.out.includes('550e8400e29b41d4a716446655440000'));

  const init = cli('init', '--yes');
  check('init writes a starting timeline', init.code === 0 && /timeline\.json/.test(init.out));

  // 3. The MCP server, which is how a coding agent uses it.
  const handshake = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance', version: '1' } } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  ].join('\n');
  const mcp = run(sandbox, bin, ['mcp'], `${handshake}\n`);
  const listed = mcp.out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((m) => m?.id === 2);
  const tools = listed?.result?.tools?.map((t) => t.name) ?? [];
  check('the MCP server answers tools/list with six tools', tools.length === 6, tools.join(', '));

  // 4. The licence and the readme a user actually receives.
  const shippedReadme = readFileSync(join(pkgDir, 'README.md'), 'utf8');
  check('the shipped README states the real rule count', shippedReadme.includes(`${ruleCount} rules`));
  check('the shipped README carries the affiliation disclaimer', /Not affiliated with Google/i.test(shippedReadme));
  check('the licence ships', readFileSync(join(pkgDir, 'LICENSE'), 'utf8').includes('MIT'));
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log('\nacceptance: the published artifact, used as a stranger uses it\n');
for (const line of passes) console.log(line);
if (failures.length) {
  console.log('');
  for (const line of failures) console.log(line);
  console.log(`\n${failures.length} of ${passes.length + failures.length} checks failed.\n`);
  process.exit(1);
}
console.log(`\nAll ${passes.length} checks passed.\n`);
