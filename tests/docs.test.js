// Every rule in the catalogue has a Google fact: a verbatim quote, an https
// URL, and the date it was read. When a page changes, src/google/docs.ts
// changes and this file is where the change shows.
// Run alone with: node --test tests/docs.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_RULES, googleRule, READ_ON } from '../dist/google/docs.js';

// The 63 rule ids of BRIEF section 5, by group.
export const RULE_IDS = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6',
  'F1', 'F2', 'F3', 'F4',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'I1', 'I2', 'I3', 'I4', 'I5',
  'J1', 'J2', 'J3', 'J4',
];

test('there are 63 rule ids and each has a Google fact', () => {
  assert.equal(RULE_IDS.length, 63);
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
  for (const id of RULE_IDS) assert.equal(GOOGLE_RULES[id].readOn, READ_ON, id);
});

test('quotes are Google\'s text and observations are kept apart', () => {
  for (const id of RULE_IDS) {
    const rule = GOOGLE_RULES[id];
    assert.ok(!/observed|seen in a live app/i.test(rule.quote), `${id}: an observation leaked into the quote`);
    if (rule.observed) assert.match(rule.observed, /20\d\d-\d\d/, `${id}: an observation carries a date`);
  }
});
