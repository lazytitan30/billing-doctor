// The engine around the rules: ordering, exit code, text and JSON output, a
// rule that throws, and the diagnose command.
// Run alone with: node --test tests/engine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sortFindings, exitCodeFor, formatFindings, summaryLine } from '../dist/engine/findings.js';
import { diagnose } from '../dist/engine/diagnose.js';
import { RULES, ruleById, GROUPS } from '../dist/engine/catalogue.js';
import { parseTimeline } from '../dist/engine/timeline.js';
import { GOOGLE_RULES } from '../dist/google/docs.js';
import { FIXTURES } from './fixtures.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const rule = { quote: 'q', url: 'https://example.com', readOn: '2026-09-09', title: 't' };
const finding = (ruleId, severity, evidence, confidence = 'certain') => ({
  ruleId,
  severity,
  title: ruleId,
  evidence,
  mechanism: 'm',
  googleRule: rule,
  fix: `runbook:${ruleId}`,
  confidence,
  nextCheck: 'n',
});

test('findings sort by severity, then first evidence index, then rule id', () => {
  const sorted = sortFindings([
    finding('J1', 'medium', [4]),
    finding('B1', 'high', [9]),
    finding('C3', 'high', [2]),
    finding('A3', 'info', []),
    finding('D2', 'high', [2]),
    finding('A5', 'medium', []),
    finding('C5', 'medium', [1]),
  ]);
  assert.deepEqual(
    sorted.map((f) => f.ruleId),
    ['C3', 'D2', 'B1', 'C5', 'J1', 'A5', 'A3'],
  );
});

test('exit code is 1 only when a high finding exists', () => {
  assert.equal(exitCodeFor([]), 0);
  assert.equal(exitCodeFor([finding('C5', 'medium', [1])]), 0);
  assert.equal(exitCodeFor([finding('C5', 'medium', [1]), finding('B1', 'high', [0])]), 1);
});

test('the summary line counts by severity', () => {
  assert.equal(summaryLine([]), 'no findings');
  assert.equal(summaryLine([finding('B1', 'high', [0]), finding('C5', 'medium', [1]), finding('J1', 'medium', [2])]), '3 findings: 1 high, 2 medium');
});

test('text output carries evidence, the quote, the next check and the runbook pointer', () => {
  const text = formatFindings([finding('B1', 'high', [0, 6], 'likely')]);
  assert.match(text, /^HIGH/m);
  assert.match(text, /B1  B1  \[likely\]/);
  assert.match(text, /evidence  #0/);
  assert.match(text, /Google    "q"/);
  assert.match(text, /next      n/);
  assert.match(text, /fix       runbook B1 \(billing-doctor rule B1\)/);
  assert.match(text, /1 finding: 1 high$/);
});

test('every registered rule has a Google fact, a title and a two-sentence description', () => {
  assert.ok(RULES.length >= 16);
  for (const r of RULES) {
    assert.ok(GOOGLE_RULES[r.id], `${r.id} has no entry in docs.ts`);
    assert.ok(GROUPS[r.group], `${r.id} has an unknown group`);
    assert.ok(r.title.length > 10, `${r.id} title`);
    const sentences = r.detects.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    assert.ok(sentences <= 2, `${r.id}: detects must be at most two sentences (${sentences})`);
  }
  assert.equal(ruleById('b1').id, 'B1');
  assert.equal(ruleById('Z9'), undefined);
});

test('a rule that throws is reported and the other rules still run', () => {
  const timeline = parseTimeline(readFileSync(join(FIXTURES, 'rules', 'B1-unacknowledged-refund.json'), 'utf8')).timeline;
  const broken = { id: 'B1', group: 'B', severity: 'high', title: 'x', detects: 'x.', run() { throw new Error('boom'); } };
  RULES.push({ ...broken, id: 'ZZ' });
  try {
    const result = diagnose(timeline);
    assert.deepEqual(result.errors, ['ZZ: boom']);
    assert.equal(result.findings[0].ruleId, 'B1');
  } finally {
    RULES.pop();
  }
});

test('--rules limits which rules run', () => {
  const timeline = parseTimeline(readFileSync(join(FIXTURES, 'rules', 'B1-unacknowledged-refund.json'), 'utf8')).timeline;
  assert.equal(diagnose(timeline, { rules: ['c3'] }).findings.length, 0);
  assert.equal(diagnose(timeline, { rules: ['B1'] }).findings.length, 1);
});

test('the diagnose command exits 1 on a high finding, 0 on a clean timeline, and prints JSON on request', () => {
  const b1 = join(FIXTURES, 'rules', 'B1-unacknowledged-refund.json');
  const text = spawnSync(process.execPath, [cli, 'diagnose', b1], { encoding: 'utf8' });
  assert.equal(text.status, 1, text.stderr);
  assert.match(text.stdout, /1 finding: 1 high/);
  assert.match(text.stdout, /B1  Purchase never acknowledged/);
  assert.match(text.stdout, /exit 1: a high finding is present/);

  const json = spawnSync(process.execPath, [cli, 'diagnose', b1, '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 1);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.findings[0].ruleId, 'B1');
  assert.deepEqual(parsed.findings[0].evidence, [0, 6]);
  assert.equal(parsed.exitCode, 1);

  const clean = spawnSync(process.execPath, [cli, 'diagnose', join(FIXTURES, 'clean', '01-purchase-renew-cancel-expire.json')], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /no findings/);

  const bad = spawnSync(process.execPath, [cli, 'diagnose', join(FIXTURES, 'rtdn', 'test-notification.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /not a valid timeline/);
});
