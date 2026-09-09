// The rules and rule commands, and kit detection.
// Run alone with: node --test tests/rules-cmd.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findKit, runbookEntry } from '../dist/kit.js';
import { RULES } from '../dist/engine/catalogue.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = (args, options = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...options });

test('rules lists all 63 rules with ids, grouped', () => {
  const r = run(['rules']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^A\. Configuration and permissions/m);
  assert.match(r.stdout, /^J\. Ledger integrity, retention, redaction/m);
  assert.match(r.stdout, /63 rules\./);
  for (const rule of RULES) assert.match(r.stdout, new RegExp(`^  ${rule.id.padEnd(4)}`, 'm'));
  const json = run(['rules', '--json']);
  assert.equal(JSON.parse(json.stdout).length, 63);
});

test('rule B1 prints the quote, the link, the date, and the kit pointer without a kit', () => {
  const r = run(['rule', 'b1'], { env: { ...process.env, BILLING_DOCTOR_KIT: '' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^B1  Purchase never acknowledged/);
  assert.match(r.stdout, /must be done within three days/);
  assert.match(r.stdout, /read 2026-09-09/);
  assert.match(r.stdout, /https:\/\/developer\.android\.com\/google\/play\/billing\/integrate/);
  assert.match(r.stdout, /The Incident Kit adds a runbook entry here/);
});

test('rule G2 prints the observed behaviour apart from the quote', () => {
  const r = run(['rule', 'G2']);
  assert.match(r.stdout, /Observed in a live app:/);
  assert.match(r.stdout, /still answered SUBSCRIPTION_STATE_ACTIVE/);
});

test('an unknown rule exits 2', () => {
  const r = run(['rule', 'Z9']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no rule Z9/);
});

test('the kit folder unlocks the runbook text, by flag, by env, and by ./billing-doctor-kit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'billing-doctor-kit-'));
  const kit = join(dir, 'billing-doctor-kit');
  mkdirSync(join(kit, 'runbook'), { recursive: true });
  writeFileSync(join(kit, 'runbook', 'B1.md'), '# B1 runbook\n\nSymptom: the user paid and lost access three days later.\n');

  assert.equal(findKit(undefined, {}, dir), kit, 'found in the working directory');
  assert.equal(findKit(undefined, { BILLING_DOCTOR_KIT: kit }, tmpdir()), kit, 'found through the environment');
  assert.equal(findKit(kit, {}, tmpdir()), kit, 'found through the flag');
  assert.equal(findKit(undefined, {}, tmpdir()), undefined, 'absent otherwise');
  assert.equal(findKit(dir, {}, tmpdir()), undefined, 'a folder without a runbook is not a kit');
  assert.match(runbookEntry(kit, 'b1'), /Symptom: the user paid/);
  assert.equal(runbookEntry(kit, 'B2'), undefined);

  const byFlag = run(['rule', 'B1', '--kit', kit]);
  assert.match(byFlag.stdout, /Runbook \(/);
  assert.match(byFlag.stdout, /Symptom: the user paid and lost access/);
  const byCwd = run(['rule', 'B1'], { cwd: dir, env: { ...process.env, BILLING_DOCTOR_KIT: '' } });
  assert.match(byCwd.stdout, /Symptom: the user paid/);
  const json = run(['rule', 'B1', '--kit', kit, '--json']);
  assert.match(JSON.parse(json.stdout).runbook, /Symptom/);
});
