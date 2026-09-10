// Group I: testing and Console. One fixture per rule; each triggers exactly
// its rule. Run alone with: node --test tests/rules-I.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'I');

test('every I rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.deepEqual(ids, ['I1', 'I2', 'I3', 'I4', 'I5', 'I6']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
