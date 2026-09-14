// The noise fixtures. Each is the shape of a report from the 2026-09-13
// measurement on which a rule spoke about the file rather than the fault: a
// second process read as a second client, a connection from a later session,
// an API read taken for a sale, a ledger nobody included, two buyers read as
// one, and three rules stacking on a timeline with nothing from the server.
// The expected findings are what the tool says now; a fixture that starts
// saying more is a regression. Run alone with: node --test tests/noise.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertNoiseFixture } from './fixtures.js';

const fixtures = listFixtures('noise');

test('there are ten noise fixtures', () => {
  assert.equal(fixtures.length, 10);
});

for (const name of fixtures) {
  test(name, () => assertNoiseFixture(name));
}
