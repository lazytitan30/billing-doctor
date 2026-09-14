// Group K: the device and the Play Billing Library. What the app on the phone
// did, before anything reached a server. One fixture per rule; each triggers
// exactly its rule. Run alone with: node --test tests/rules-K.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFixtures, assertRuleFixture } from './fixtures.js';
import { outcomeOf } from '../dist/engine/rules/deviceCodes.js';

const fixtures = listFixtures('rules', 'K');

test('every K rule has a fixture', () => {
  const ids = fixtures.map((name) => name.split('-')[0]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.deepEqual(ids, ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10', 'K11', 'K12', 'K13', 'K14', 'K15', 'K16', 'K17']);
});

for (const name of fixtures) {
  test(name, () => assertRuleFixture(name));
}

// The number is Google's. The wording is whatever the wrapper threw, and the
// rules have to read both, because Capacitor, Flutter and React Native
// wrappers routinely drop the number.
test('a failure is read from the response code when there is one', () => {
  const outcome = outcomeOf({ kind: 'app', type: 'launch_billing_flow', responseCode: 7, i: 0, tMs: 0 });
  assert.deepEqual(outcome, { code: 7, name: 'ITEM_ALREADY_OWNED', exact: true });
});

test('a failure is read from the wrapper wording when the code is missing', () => {
  const cases = [
    ['Item is already owned', 7],
    ['ITEM_NOT_OWNED', 8],
    ['purchase cancelled by user', 1],
    ['The user canceled the purchase', 1],
    ['DEVELOPER_ERROR: offer token missing', 5],
    ['Feature not supported on this device', -2],
    ['product not found', 4],
    ['Billing unavailable', 3],
    ['Not connected to the Play Store', -1],
    ['request timed out', 2],
    ['Network error', 12],
  ];
  for (const [text, code] of cases) {
    const outcome = outcomeOf({ kind: 'app', type: 'launch_billing_flow', errorMessage: text, i: 0, tMs: 0 });
    assert.equal(outcome?.code, code, text);
    assert.equal(outcome?.exact, false, `${text}: reading text is weaker evidence than a code`);
  }
});

test('an event that records no failure has no outcome', () => {
  assert.equal(outcomeOf({ kind: 'app', type: 'query_products', i: 0, tMs: 0 }), undefined);
  assert.equal(outcomeOf({ kind: 'ledger', op: 'grant', i: 0, tMs: 0 }), undefined);
  assert.equal(
    outcomeOf({ kind: 'app', type: 'launch_billing_flow', errorMessage: 'something went wrong', i: 0, tMs: 0 }),
    undefined,
    'wording the table does not recognise is not guessed at',
  );
});
