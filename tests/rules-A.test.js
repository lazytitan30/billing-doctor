// Group A: configuration and permissions. One fixture per rule; each triggers
// exactly its rule. Run alone with: node --test tests/rules-A.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'A');

test('every A rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.deepEqual(ids, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
