// Group H: account binding and restore. One fixture per rule; each triggers
// exactly its rule. Run alone with: node --test tests/rules-H.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'H');

test('every H rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]);
  assert.deepEqual(ids, ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
