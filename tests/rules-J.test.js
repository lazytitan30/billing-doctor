// Group J: ledger integrity, retention, redaction. One fixture per rule; each
// triggers exactly its rule. Run alone with: node --test tests/rules-J.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'J');

test('every J rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]);
  assert.deepEqual(ids, ['J1', 'J2', 'J3', 'J4']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
