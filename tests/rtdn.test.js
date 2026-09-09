// RTDN decoding: the five fixture envelopes, the bare forms, and the errors.
// Run alone with: node --test tests/rtdn.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodeRtdn, describeRtdn, SUBSCRIPTION_NOTIFICATION_TYPES } from '../dist/google/rtdn.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/rtdn/${name}`, import.meta.url), 'utf8'));
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('a subscription renewal envelope decodes to type 2 with the token and a re-fetch next step', () => {
  const d = decodeRtdn(fixture('subscription-renewed.json'));
  assert.equal(d.notification, 'subscription');
  assert.equal(d.type.value, 2);
  assert.equal(d.type.name, 'SUBSCRIPTION_RENEWED');
  assert.equal(d.token, 'tok_a1');
  assert.equal(d.messageId, 'm-1001');
  assert.equal(d.packageName, 'com.example.app');
  assert.equal(d.eventTime, '2026-09-01T10:00:09.000Z');
  assert.match(d.nextStep, /subscriptionsv2\.get/);
});

test('a voided purchase decodes with refund and product types named', () => {
  const d = decodeRtdn(fixture('voided-purchase.json'));
  assert.equal(d.notification, 'voidedPurchase');
  assert.equal(d.refundType.name, 'REFUND_TYPE_FULL_REFUND');
  assert.equal(d.productType.name, 'PRODUCT_TYPE_SUBSCRIPTION');
  assert.equal(d.orderId, 'GPA.0000-0000-0000-00000');
  assert.match(d.nextStep, /Revoke access/);
  assert.match(d.nextStep, /can still read ACTIVE/);
});

test('a test notification decodes to nothing to apply', () => {
  const d = decodeRtdn(fixture('test-notification.json'));
  assert.equal(d.notification, 'test');
  assert.equal(d.token, undefined);
  assert.match(d.nextStep, /nothing to apply/);
});

test('a pending refund review decodes with the 24-hour next step and no access change', () => {
  const d = decodeRtdn(fixture('pending-refund-review.json'));
  assert.equal(d.notification, 'pendingRefundReview');
  assert.equal(d.pendingRefundToken, 'prt_0001');
  assert.equal(d.refundReason.name, 'CHARGEBACK');
  assert.equal(d.obfuscatedAccountId, 'hm_9f3c');
  assert.match(d.nextStep, /24 hours/);
  assert.match(d.nextStep, /Access does not change/);
});

test('a one-time product cancellation decodes with the sku', () => {
  const d = decodeRtdn(fixture('one-time-canceled.json'));
  assert.equal(d.notification, 'oneTimeProduct');
  assert.equal(d.type.name, 'ONE_TIME_PRODUCT_CANCELED');
  assert.equal(d.sku, 'gems_100');
  assert.match(d.nextStep, /nothing to grant/);
});

test('the base64 data alone and the decoded object both decode', () => {
  const envelope = fixture('subscription-renewed.json');
  const fromString = decodeRtdn(envelope.message.data);
  assert.equal(fromString.type.value, 2);
  assert.equal(fromString.messageId, null, 'no envelope, no messageId');
  const object = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'));
  const fromObject = decodeRtdn(object);
  assert.equal(fromObject.token, 'tok_a1');
});

test('a partial refund says adjust the quantity, not revoke', () => {
  const d = decodeRtdn({
    version: '1.0',
    packageName: 'com.example.app',
    eventTimeMillis: 1788256809000,
    voidedPurchaseNotification: { purchaseToken: 'tok_c9', orderId: 'GPA.0000-0000-0000-00001', productType: 2, refundType: 2 },
  });
  assert.equal(d.refundType.name, 'REFUND_TYPE_QUANTITY_BASED_PARTIAL_REFUND');
  assert.match(d.nextStep, /refundableQuantity/);
  assert.match(d.nextStep, /do not revoke the whole purchase/);
});

test('an unknown subscription type is reported, not dropped', () => {
  const d = decodeRtdn({ subscriptionNotification: { notificationType: 99, purchaseToken: 'tok_z' } });
  assert.equal(d.type.name, 'UNKNOWN');
  assert.match(d.nextStep, /unknown subscription type 99/);
});

test('the type table has every documented value and marks 8 deprecated', () => {
  assert.deepEqual(
    Object.keys(SUBSCRIPTION_NOTIFICATION_TYPES).map(Number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 22],
  );
  assert.equal(SUBSCRIPTION_NOTIFICATION_TYPES[8].deprecated, true);
});

test('errors: no data, bad base64, no member', () => {
  assert.throws(() => decodeRtdn({ message: { messageId: 'x' } }), /no message\.data/);
  assert.throws(() => decodeRtdn({ message: { data: 'not base64 json' } }), /does not decode/);
  assert.throws(() => decodeRtdn({ version: '1.0', packageName: 'com.example.app' }), /carries none of/);
  assert.throws(() => decodeRtdn(42), /expected a push envelope/);
});

test('describeRtdn prints the next step and warns when messageId is missing', () => {
  const lines = describeRtdn(decodeRtdn(fixture('voided-purchase.json')));
  assert.ok(lines.some((l) => l.startsWith('Next step:')));
  const noId = describeRtdn(decodeRtdn({ subscriptionNotification: { notificationType: 13, purchaseToken: 'tok_a1' } }));
  assert.ok(noId.some((l) => /cannot de-duplicate/.test(l)));
});

test('the rtdn command decodes a file, and --json prints the structure', () => {
  const file = fileURLToPath(new URL('../fixtures/rtdn/subscription-renewed.json', import.meta.url));
  const plain = spawnSync(process.execPath, [cli, 'rtdn', file], { encoding: 'utf8' });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /SUBSCRIPTION_RENEWED \(2\)/);
  assert.match(plain.stdout, /Next step:/);
  const json = spawnSync(process.execPath, [cli, 'rtdn', file, '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(json.stdout).token, 'tok_a1');
  const bad = spawnSync(process.execPath, [cli, 'rtdn', fileURLToPath(new URL('../package.json', import.meta.url))], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /cannot decode/);
});
