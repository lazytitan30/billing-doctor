// Group C: notifications. One fixture per rule; each triggers exactly its
// rule. Run alone with: node --test tests/rules-C.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'C');

test('every C rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]);
  assert.deepEqual(ids, ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
