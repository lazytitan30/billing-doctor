// Group E: lifecycle events. One fixture per rule; each triggers exactly its
// rule. Run alone with: node --test tests/rules-E.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'E');

test('every E rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.deepEqual(ids, ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
