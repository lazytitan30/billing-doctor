// Every rule in the catalogue has a Google fact: a verbatim quote, an https
// URL, and the date it was read. When a page changes, src/google/docs.ts
// changes and this file is where the change shows.
// Run alone with: node --test tests/docs.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_RULES, googleRule, READ_ON, READ_ON_DEVICE, READ_ON_FIELD, READ_ON_SAMPLE } from '../dist/google/docs.js';

// The 97 rule ids of BRIEF section 5, by group.
export const RULE_IDS = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8',
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'I1', 'I2', 'I3', 'I4', 'I5', 'I6',
  'J1', 'J2', 'J3', 'J4', 'J5',
  'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10', 'K11', 'K12', 'K13', 'K14', 'K15', 'K16', 'K17',
];

// The four rules the second measurement (2026-09-13) earned, read the day after.
export const THIRD_SWEEP = new Set(['B14', 'F8', 'K16', 'K17']);

// The ids added after the first sweep, all read on the later date: the device
// group, and the four the mined incidents showed were missing.
export const SECOND_SWEEP = new Set([
  'B12', 'B13', 'F7', 'K15',
  'A7', 'B10', 'B11', 'C8', 'D11', 'E7', 'E8', 'F5', 'F6', 'G7', 'I6', 'J5',
  'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10', 'K11', 'K12', 'K13', 'K14',
]);

test('there are 97 rule ids and each has a Google fact', () => {
  assert.equal(RULE_IDS.length, 97);
  for (const id of RULE_IDS) {
    const rule = googleRule(id);
    assert.ok(rule.quote.length >= 20, `${id}: quote too short to be a rule`);
    assert.match(rule.url, /^https:\/\//, `${id}: url`);
    assert.match(rule.readOn, /^\d{4}-\d{2}-\d{2}$/, `${id}: readOn`);
    assert.ok(rule.title.length > 0, `${id}: title`);
  }
});

test('no entry exists for an id outside the catalogue, and the lookup throws', () => {
  assert.deepEqual(Object.keys(GOOGLE_RULES).sort(), [...RULE_IDS].sort());
  assert.throws(() => googleRule('Z9'), /a rule without a documentation quote does not ship/);
});

test('the read date is the audit sweep date until the next re-read', () => {
  assert.equal(READ_ON, '2026-09-09');
  assert.equal(READ_ON_DEVICE, '2026-09-10');
  assert.equal(READ_ON_FIELD, '2026-09-10');
  assert.equal(READ_ON_SAMPLE, '2026-09-14');
  for (const id of RULE_IDS) {
    const expected = THIRD_SWEEP.has(id) ? READ_ON_SAMPLE : SECOND_SWEEP.has(id) ? READ_ON_DEVICE : READ_ON;
    assert.equal(GOOGLE_RULES[id].readOn, expected, id);
  }
});

test('quotes are Google\'s text and observations are kept apart', () => {
  for (const id of RULE_IDS) {
    const rule = GOOGLE_RULES[id];
    assert.ok(!/observed|seen in a live app/i.test(rule.quote), `${id}: an observation leaked into the quote`);
    if (rule.observed) assert.match(rule.observed, /20\d\d-\d\d/, `${id}: an observation carries a date`);
  }
});
