// The command line: init and validate.
// Run alone with: node --test tests/cli.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const example = fileURLToPath(new URL('../fixtures/example-timeline.json', import.meta.url));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...options });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test('no command prints usage and exits 2', () => {
  const { code, out } = run([]);
  assert.equal(code, 2);
  assert.match(out, /Not affiliated with Google/);
});

test('--version prints the version', () => {
  const { code, out } = run(['--version']);
  assert.equal(code, 0);
  assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
});

test('init --yes writes a timeline that validates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'billing-doctor-'));
  const out = join(dir, 'timeline.json');
  const init = run(['init', '--yes', '--out', out]);
  assert.equal(init.code, 0, init.err);
  assert.equal(existsSync(out), true);
  const written = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(written.schema, 'billing-doctor-timeline/1');
  assert.deepEqual(written.events, []);
  assert.equal(written.policy.ackWithinHours, 72);
  assert.equal(written.policy.voidedPurchasesSweep, true);
  assert.equal(written.config.rtdn.pushEndpointAuth, 'none');

  const validate = run(['validate', out]);
  assert.equal(validate.code, 0, validate.err);
  assert.match(validate.out, /valid, 0 event\(s\)/);
});

test('init refuses to overwrite without --force', () => {
  const dir = mkdtempSync(join(tmpdir(), 'billing-doctor-'));
  const out = join(dir, 'timeline.json');
  writeFileSync(out, '{}');
  const second = run(['init', '--yes', '--out', out]);
  assert.equal(second.code, 2);
  assert.match(second.err, /--force/);
  const forced = run(['init', '--yes', '--out', out, '--force']);
  assert.equal(forced.code, 0);
});

test('validate accepts the example and reports a real-looking token', () => {
  const ok = run(['validate', example]);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /valid, 7 event\(s\), 0 warning\(s\)/);

  const dir = mkdtempSync(join(tmpdir(), 'billing-doctor-'));
  const file = join(dir, 'real.json');
  const timeline = JSON.parse(readFileSync(example, 'utf8'));
  timeline.events[0].token = 'kfjhsdkjfhs.AO-J1Oy-real-looking-token-value-0123456789abcdefghijklmnop';
  writeFileSync(file, JSON.stringify(timeline));
  const warned = run(['validate', file]);
  assert.equal(warned.code, 0, 'a warning is not a failure');
  assert.match(warned.out, /warning: events\[0\]\.token/);
  assert.match(warned.out, /billing-doctor redact/);
});

test('validate exits 1 on a schema error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'billing-doctor-'));
  const file = join(dir, 'bad.json');
  writeFileSync(file, JSON.stringify({ schema: 'nope', events: [] }));
  const { code, err } = run(['validate', file]);
  assert.equal(code, 1);
  assert.match(err, /error: schema/);
});
