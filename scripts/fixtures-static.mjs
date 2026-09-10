// Writes the two fixture sets that are not timelines: the Pub/Sub push
// envelopes under fixtures/rtdn (for `billing-doctor rtdn`) and the
// SubscriptionPurchaseV2 resources under fixtures/subscriptions (for
// `billing-doctor state`). Generated rather than hand-written because the
// notification payload is base64 inside the envelope, where a search and
// replace cannot reach it.
//
// Run: node scripts/fixtures-static.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const rtdnDir = join(root, 'fixtures', 'rtdn');
const subsDir = join(root, 'fixtures', 'subscriptions');
mkdirSync(rtdnDir, { recursive: true });
mkdirSync(subsDir, { recursive: true });

const ORDER = 'GPA.0000-0000-0000-00000';
const PACKAGE = 'com.example.app';
const EVENT_TIME = '1788256809000';

// ---- Pub/Sub push envelopes ----

const envelope = (notification, messageId) => ({
  message: {
    data: Buffer.from(JSON.stringify({ version: '1.0', packageName: PACKAGE, eventTimeMillis: EVENT_TIME, ...notification })).toString('base64'),
    messageId,
    publishTime: '2026-09-01T10:00:09.123Z',
  },
  subscription: 'projects/my-other-project/subscriptions/rtdn-push',
});

const rtdn = {
  'subscription-renewed.json': envelope({ subscriptionNotification: { version: '1.0', notificationType: 2, purchaseToken: 'tok_a1', subscriptionId: 'basic_monthly' } }, 'm-1001'),
  'voided-purchase.json': envelope({ voidedPurchaseNotification: { purchaseToken: 'tok_a1', orderId: ORDER, productType: 1, refundType: 1 } }, 'm-1002'),
  'test-notification.json': envelope({ testNotification: { version: '1.0' } }, 'm-1003'),
  'pending-refund-review.json': envelope({ pendingRefundReviewNotification: { version: '1.0', pendingRefundToken: 'prt_0001', orderId: ORDER, refundReason: 7, obfuscatedAccountId: 'hm_9f3c' } }, 'm-1004'),
  'one-time-canceled.json': envelope({ oneTimeProductNotification: { version: '1.0', notificationType: 2, purchaseToken: 'tok_c9', sku: 'coins_100' } }, 'm-1005'),
};

// ---- SubscriptionPurchaseV2 resources ----

const sub = (extra) => ({
  kind: 'androidpublisher#subscriptionPurchaseV2',
  regionCode: 'DE',
  latestOrderId: ORDER,
  startTime: '2026-09-01T10:00:00Z',
  ...extra,
});

const item = (extra) => ({
  productId: 'basic_monthly',
  expiryTime: '2026-10-01T10:00:00Z',
  autoRenewingPlan: { autoRenewEnabled: true },
  offerDetails: { basePlanId: 'monthly' },
  latestSuccessfulOrderId: ORDER,
  ...extra,
});

const ids = { obfuscatedExternalAccountId: 'hm_9f3c' };
const ACKED = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
const PENDING = 'ACKNOWLEDGEMENT_STATE_PENDING';

const subscriptions = {
  'active-unacknowledged.json': sub({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: PENDING, lineItems: [item({})], externalAccountIdentifiers: ids }),
  'canceled-not-expired.json': sub({
    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    acknowledgementState: ACKED,
    lineItems: [item({ autoRenewingPlan: { autoRenewEnabled: false } })],
    canceledStateContext: { userInitiatedCancellation: { cancelTime: '2026-09-05T08:00:00Z' } },
    externalAccountIdentifiers: ids,
  }),
  'on-hold.json': sub({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD', acknowledgementState: ACKED, lineItems: [item({})], externalAccountIdentifiers: ids }),
  'paused.json': sub({
    subscriptionState: 'SUBSCRIPTION_STATE_PAUSED',
    acknowledgementState: ACKED,
    lineItems: [item({})],
    pausedStateContext: { autoResumeTime: '2026-11-01T10:00:00Z' },
    externalAccountIdentifiers: ids,
  }),
  'upgraded-linked-token.json': sub({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: ACKED,
    linkedPurchaseToken: 'tok_a1',
    lineItems: [item({ productId: 'plus_monthly', offerDetails: { basePlanId: 'monthly-plus' } })],
    externalAccountIdentifiers: ids,
  }),
  'prepaid-unacknowledged.json': sub({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: PENDING,
    lineItems: [{ productId: 'basic_prepaid', expiryTime: '2026-09-04T10:00:00Z', prepaidPlan: { allowExtendAfterTime: '2026-09-03T10:00:00Z' }, offerDetails: { basePlanId: 'prepaid-3d' } }],
    externalAccountIdentifiers: ids,
  }),
  'test-purchase.json': sub({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: ACKED,
    lineItems: [item({ expiryTime: '2026-09-01T10:05:00Z' })],
    testPurchase: {},
    externalAccountIdentifiers: ids,
  }),
  'expired.json': sub({
    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    acknowledgementState: ACKED,
    lineItems: [item({ expiryTime: '2026-09-01T10:00:00Z', autoRenewingPlan: { autoRenewEnabled: false } })],
    startTime: '2026-08-01T10:00:00Z',
    canceledStateContext: { systemInitiatedCancellation: {} },
  }),
  'deferred-replacement.json': sub({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: ACKED,
    lineItems: [item({ autoRenewingPlan: { autoRenewEnabled: false }, deferredItemReplacement: { productId: 'plus_monthly' } })],
    externalAccountIdentifiers: ids,
  }),
};

for (const [name, body] of Object.entries(rtdn)) writeFileSync(join(rtdnDir, name), `${JSON.stringify(body, null, 2)}\n`);
for (const [name, body] of Object.entries(subscriptions)) writeFileSync(join(subsDir, name), `${JSON.stringify(body, null, 2)}\n`);
console.log(`wrote ${Object.keys(rtdn).length} push envelopes and ${Object.keys(subscriptions).length} subscription resources`);
