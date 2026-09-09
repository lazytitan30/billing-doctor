// Shared helpers for the fixture-driven rule tests. A rule fixture is a
// timeline plus an expected.json beside it; the test asserts the rule ids, in
// order, and each finding's evidence and confidence.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTimeline, normalizeTimeline } from '../dist/engine/timeline.js';
import { diagnose } from '../dist/engine/diagnose.js';

export const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

export function listFixtures(dir, prefix = '') {
  return readdirSync(join(FIXTURES, dir))
    .filter((name) => name.endsWith('.json') && !name.endsWith('.expected.json') && name.startsWith(prefix))
    .sort();
}

export function loadTimeline(dir, name) {
  const result = parseTimeline(readFileSync(join(FIXTURES, dir, name), 'utf8'));
  assert.equal(result.ok, true, `${name}: ${result.errors.join('; ')}`);
  // The J3 fixture carries a real-looking token on purpose; every other
  // fixture must be clean.
  if (!name.startsWith('J3')) assert.deepEqual(result.warnings, [], `${name} carries something that looks real`);
  return result.timeline;
}

export function runFixture(dir, name) {
  const timeline = loadTimeline(dir, name);
  const diagnosis = diagnose(normalizeTimeline(timeline));
  assert.deepEqual(diagnosis.errors, [], `${name}: a rule threw`);
  return diagnosis;
}

function assertExpected(dir, name) {
  const diagnosis = runFixture(dir, name);
  const expected = JSON.parse(readFileSync(join(FIXTURES, dir, name.replace(/\.json$/, '.expected.json')), 'utf8'));
  const got = diagnosis.findings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity,
    confidence: f.confidence,
    evidence: f.evidence,
  }));
  assert.deepEqual(got, expected.findings, `${name}: findings differ`);
  for (const finding of diagnosis.findings) {
    assert.ok(finding.googleRule.quote.length > 0, `${name}: ${finding.ruleId} has no quote`);
    assert.ok(finding.nextCheck.length > 0, `${name}: ${finding.ruleId} has no next check`);
    assert.ok(finding.mechanism.length > 0, `${name}: ${finding.ruleId} has no mechanism`);
  }
  return diagnosis;
}

// Every rule fixture triggers exactly its rule, with the evidence it names.
export function assertRuleFixture(name) {
  return assertExpected('rules', name);
}

// A composite fixture produces its expected findings in the expected order.
export function assertCompositeFixture(name) {
  const diagnosis = assertExpected('composite', name);
  assert.ok(diagnosis.findings.length >= 3, `${name}: a composite fixture should produce several findings`);
}

export function assertClean(name) {
  const diagnosis = runFixture('clean', name);
  const ids = diagnosis.findings.map((f) => `${f.ruleId}[${f.evidence.join(',')}]`);
  assert.deepEqual(ids, [], `${name} must produce no findings; got ${ids.join(' ')}`);
}
