// The composite fixtures: realistic weeks with several findings. The order
// (severity, then first evidence index, then rule id) and the evidence
// indexes are the test. Run alone with: node --test tests/composite.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertCompositeFixture } from './fixtures.js';

const fixtures = listFixtures('composite');

test('there are three composite fixtures', () => {
  assert.equal(fixtures.length, 3);
});

for (const name of fixtures) {
  test(`${name} produces the expected findings in order`, () => assertCompositeFixture(name));
}
