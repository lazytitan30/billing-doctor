// Subscription state explanations over the fixture resources.
// Run alone with: node --test tests/state.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { explainSubscription, SUBSCRIPTION_STATE_INFO } from '../dist/google/states.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/subscriptions/${name}`, import.meta.url), 'utf8'));
const now = new Date('2026-09-10T00:00:00Z');
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('every state in the reference has plain words and an access column', () => {
  const names = Object.keys(SUBSCRIPTION_STATE_INFO);
  assert.equal(names.length, 9);
  for (const name of names) {
    assert.ok(SUBSCRIPTION_STATE_INFO[name].words.length > 10, name);
    assert.ok(['yes', 'no', 'until-expiry', 'not-yet'].includes(SUBSCRIPTION_STATE_INFO[name].access), name);
  }
});

test('an active, unacknowledged subscription: access yes, deadline three days after startTime', () => {
  const e = explainSubscription(fixture('active-unacknowledged.json'), { now });
  assert.equal(e.accessNow, true);
  assert.equal(e.expiryTime, '2026-10-01T10:00:00.000Z');
  const ack = e.lines.find((l) => l.startsWith('Acknowledgement:'));
  assert.match(ack, /not acknowledged yet/);
  assert.match(ack, /by 2026-09-04T10:00:00\.000Z/);
  assert.match(ack, /refunds it and revokes/);
  assert.ok(e.lines.some((l) => /auto-renewing/.test(l)));
  assert.ok(e.lines.some((l) => /Obfuscated account id: hm_9f3c/.test(l)));
});

test('canceled but not expired keeps access until expiryTime, and a policy that revokes on CANCELED disagrees', () => {
  const resource = fixture('canceled-not-expired.json');
  const e = explainSubscription(resource, { now });
  assert.equal(e.access, 'until-expiry');
  assert.equal(e.accessNow, true);
  assert.ok(e.lines.some((l) => /the user cancelled/.test(l)));
  assert.match(e.nextStep, /keep access until expiryTime/);

  const strict = explainSubscription(resource, {
    now,
    grantOn: ['SUBSCRIPTION_STATE_ACTIVE'],
    revokeOn: ['SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_EXPIRED'],
  });
  assert.equal(strict.policyAccess, false);
  assert.equal(strict.policyDisagrees, true);
  assert.ok(strict.lines.some((l) => /disagrees with Google's rule/.test(l)));

  const late = explainSubscription(resource, { now: new Date('2026-10-02T00:00:00Z') });
  assert.equal(late.accessNow, false, 'past expiryTime, canceled means no access');
});

test('on hold and paused mean no access; paused says when it resumes', () => {
  const hold = explainSubscription(fixture('on-hold.json'), { now });
  assert.equal(hold.accessNow, false);
  assert.match(hold.nextStep, /remove access/);
  const paused = explainSubscription(fixture('paused.json'), { now });
  assert.equal(paused.accessNow, false);
  assert.ok(paused.lines.some((l) => /resumes automatically at 2026-11-01T10:00:00Z/.test(l)));
});

test('a linked purchase token says to invalidate the old one', () => {
  const e = explainSubscription(fixture('upgraded-linked-token.json'), { now });
  const line = e.lines.find((l) => l.startsWith('Linked purchase token: tok_a1'));
  assert.match(line, /Invalidate the old token/);
});

test('a prepaid plan under a week has half the plan length to acknowledge', () => {
  const e = explainSubscription(fixture('prepaid-unacknowledged.json'), { now: new Date('2026-09-01T12:00:00Z') });
  const ack = e.lines.find((l) => l.startsWith('Acknowledgement:'));
  assert.match(ack, /half the plan length/);
  assert.match(ack, /by 2026-09-02T22:00:00\.000Z/, 'a three-day plan: 1.5 days after startTime');
  assert.ok(e.lines.some((l) => /prepaid; does not renew/.test(l)));
});

test('a test purchase is called out', () => {
  const e = explainSubscription(fixture('test-purchase.json'), { now });
  assert.ok(e.lines.some((l) => /Test purchase: yes/.test(l)));
});

test('expired says revoke', () => {
  const e = explainSubscription(fixture('expired.json'), { now });
  assert.equal(e.accessNow, false);
  assert.match(e.nextStep, /revoke/);
  assert.ok(e.lines.some((l) => /Google cancelled it/.test(l)));
});

test('a deferred replacement is named and not granted early', () => {
  const e = explainSubscription(fixture('deferred-replacement.json'), { now });
  assert.ok(e.lines.some((l) => /Deferred replacement: becomes plus_monthly at the next renewal/.test(l)));
});

test('an unknown state is treated as no access and says to fetch again', () => {
  const e = explainSubscription({ subscriptionState: 'SUBSCRIPTION_STATE_SOMETHING_NEW', lineItems: [] }, { now });
  assert.equal(e.accessNow, false);
  assert.match(e.nextStep, /fetch the resource again/);
});

test('the state command prints the explanation and applies --policy and --now', () => {
  const file = fileURLToPath(new URL('../fixtures/subscriptions/canceled-not-expired.json', import.meta.url));
  const policy = fileURLToPath(new URL('../fixtures/example-timeline.json', import.meta.url));
  const run = spawnSync(process.execPath, [cli, 'state', file, '--policy', policy, '--now', '2026-09-10T00:00:00Z'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /State: SUBSCRIPTION_STATE_CANCELED/);
  assert.match(run.stdout, /Under your policy: grant\./);
  const json = spawnSync(process.execPath, [cli, 'state', file, '--json', '--now', '2026-09-10T00:00:00Z'], { encoding: 'utf8' });
  assert.equal(JSON.parse(json.stdout).accessNow, true);
});
