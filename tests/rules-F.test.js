// Group F: upgrades and linked tokens. One fixture per rule; each triggers
// exactly its rule. Run alone with: node --test tests/rules-F.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';

const fixtures = listFixtures('rules', 'F');

test('every F rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]);
  assert.deepEqual(ids, ['F1', 'F2', 'F3', 'F4']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}
