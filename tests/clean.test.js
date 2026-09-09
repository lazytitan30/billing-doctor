// The five correct lifecycles must produce zero findings, forever. A false
// positive here is a release blocker (CLAUDE.md rule 9).
// Run alone with: node --test tests/clean.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertClean } from './fixtures.js';

const fixtures = listFixtures('clean');

test('there are five clean fixtures', () => {
  assert.equal(fixtures.length, 5);
});

for (const name of fixtures) {
  test(`${name} produces no findings`, () => assertClean(name));
}
