// Smoke test: the package compiles and the library entry point loads.
// Run alone with: node --test tests/smoke.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from '../dist/index.js';

test('the package builds and exports its version', () => {
  assert.equal(VERSION, '0.1.0');
});
