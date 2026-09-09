// Group G: refunds, revocations, voided purchases. One fixture per rule; each
// triggers exactly its rule. Run alone with: node --test tests/rules-G.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'G');

test('every G rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]);
  assert.deepEqual(ids, ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
