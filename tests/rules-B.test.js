// Group B: purchase and acknowledgement. One fixture per rule; each triggers
// exactly its rule. Run alone with: node --test tests/rules-B.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'B');

test('every B rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.deepEqual(ids, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
