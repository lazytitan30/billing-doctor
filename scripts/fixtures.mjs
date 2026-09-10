// Writes the rule fixtures and the clean fixtures. Each rule fixture is the
// smallest timeline that triggers exactly its rule and nothing else; each
// clean fixture is a correct lifecycle that must produce zero findings.
// Run: node scripts/fixtures.mjs   (the output is checked in; tests read it)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixtures as makeDG } from './fixtures-DG.mjs';
import { makeFixtures as makeAHIJ } from './fixtures-AHIJ.mjs';
import { makeComposites } from './fixtures-composite.mjs';

const SCHEMA = 'billing-doctor-timeline/1';
const ACTIVE = 'SUBSCRIPTION_STATE_ACTIVE';
const GRACE = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
const CANCELED = 'SUBSCRIPTION_STATE_CANCELED';
const ON_HOLD = 'SUBSCRIPTION_STATE_ON_HOLD';
const PAUSED = 'SUBSCRIPTION_STATE_PAUSED';
const EXPIRED = 'SUBSCRIPTION_STATE_EXPIRED';
const PENDING_ACK = 'ACKNOWLEDGEMENT_STATE_PENDING';
const ACKED = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// A time as ISO, offset from a base time.
const at = (iso, offset = 0) => new Date(Date.parse(iso) + offset).toISOString().replace('.000Z', 'Z');
const millis = (iso) => Date.parse(iso);

const POLICY = {
  grantOn: [ACTIVE, GRACE, CANCELED],
  revokeOn: [ON_HOLD, PAUSED, EXPIRED],
  ackWithinHours: 72,
  refetchOnEveryNotification: true,
  handledNotificationTypes: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 17, 18, 19, 20, 22],
  voidedPurchasesSweep: true,
};

const PRODUCTS = {
  basic_monthly: 'subscription',
  plus_monthly: 'subscription',
  basic_prepaid: 'subscription',
  coins_100: 'consumable',
  pack_deluxe: 'non-consumable',
  addon_extra: 'subscription',
};

function timeline(events, extra = {}) {
  return {
    schema: SCHEMA,
    app: { packageName: 'com.example.app', billingLibrary: '8.0.0', backend: 'node', products: PRODUCTS, ...extra.app },
    policy: { ...POLICY, ...extra.policy },
    config: { rtdn: { pushEndpointAuth: 'oidc' }, ...extra.config },
    events,
  };
}

// ---- event builders ---------------------------------------------------------------

const purchase = (token, t, o = {}) => ({
  t,
  kind: 'app',
  type: 'purchase_result',
  token,
  productId: o.productId ?? 'basic_monthly',
  purchaseState: o.purchaseState ?? 'PURCHASED',
  obfuscatedAccountId: o.accountId ?? 'hm_1',
  ...o.extra,
});

const get = (token, t, o = {}) => {
  const productId = o.productId ?? 'basic_monthly';
  const event = {
    t,
    kind: 'api',
    call: o.call ?? 'subscriptionsv2.get',
    token,
    status: o.status ?? 200,
    subscriptionState: o.state ?? ACTIVE,
    acknowledgementState: o.ack ?? ACKED,
  };
  if (o.expiry) {
    event.lineItems = [
      { productId, expiryTime: o.expiry, ...(o.prepaid ? { prepaidPlan: true } : { autoRenewingPlan: true }) },
    ];
  }
  if (o.linked !== undefined) event.linkedPurchaseToken = o.linked;
  if (o.planDays) event.planDurationDays = o.planDays;
  event.externalAccountIdentifiers = { obfuscatedExternalAccountId: o.accountId ?? 'hm_1' };
  return { ...event, ...o.extra };
};

const productGet = (token, t, o = {}) => ({
  t,
  kind: 'api',
  call: 'productsv2.get',
  token,
  status: o.status ?? 200,
  productId: o.productId ?? 'pack_deluxe',
  purchaseState: o.purchaseState ?? 'PURCHASED',
  acknowledgementState: o.ack ?? PENDING_ACK,
  ...o.extra,
});

const api = (call, token, t, o = {}) => ({ t, kind: 'api', call, token, status: o.status ?? 200, ...o.extra });

const ledger = (op, token, t, o = {}) => ({ t, kind: 'ledger', op, token, ...o });

const grant = (token, t, o = {}) => ({
  t,
  kind: 'ledger',
  op: 'grant',
  token,
  userId: o.userId ?? 'u_1',
  tier: o.tier ?? 'standard',
  idempotencyKey: o.key ?? `${token}:grant`,
  ...(o.expiry ? { expiry: o.expiry, expirySource: o.expirySource ?? 'expiryTime' } : {}),
  ...o.extra,
});

const rtdn = (type, token, t, o = {}) => ({
  t,
  kind: 'rtdn',
  messageId: o.messageId === undefined ? `m-${type}` : o.messageId,
  eventTimeMillis: millis(o.eventTime ?? t),
  notificationType: type,
  token,
  endpointStatus: o.status ?? 200,
  ...o.extra,
});

const voided = (token, t, o = {}) => ({
  t,
  kind: 'rtdn',
  notification: 'voidedPurchase',
  messageId: o.messageId ?? 'm-void',
  eventTimeMillis: millis(t),
  token,
  refundType: o.refundType ?? 1,
  productType: o.productType ?? 1,
  orderId: 'GPA.0000-0000-0000-00000',
  endpointStatus: 200,
  ...o.extra,
});

const support = (t, note) => ({ t, kind: 'support', note });

// The correct opening of every subscription timeline: purchase, verify, grant,
// acknowledge, record it, notification 4, re-fetch, record it. Eight events.
function opening(token, start, o = {}) {
  const expiry = o.expiry ?? at(start, 30 * DAY);
  const productId = o.productId ?? 'basic_monthly';
  return [
    purchase(token, start, { productId, accountId: o.accountId }),
    get(token, at(start, 2 * SEC), { ack: PENDING_ACK, expiry, productId, accountId: o.accountId, prepaid: o.prepaid, planDays: o.planDays, linked: o.linked }),
    grant(token, at(start, 3 * SEC), { expiry, tier: o.tier, userId: o.userId, extra: o.grantExtra }),
    api('subscriptions.acknowledge', token, at(start, 4 * SEC)),
    ledger('ack', token, at(start, 5 * SEC)),
    rtdn(4, token, at(start, 9 * SEC), { messageId: o.messageId ?? `m-${token}-4`, eventTime: start }),
    get(token, at(start, 10 * SEC), { expiry, productId, accountId: o.accountId, prepaid: o.prepaid, planDays: o.planDays, linked: o.linked }),
    ledger('write', token, at(start, 11 * SEC), { messageId: o.messageId ?? `m-${token}-4`, fromState: ACTIVE }),
  ];
}

const S = '2026-09-01T10:00:00Z'; // the start of most fixtures
const E = '2026-10-01T10:00:00Z'; // the first expiry

const expect = (ruleId, severity, confidence, evidence) => ({ findings: [{ ruleId, severity, confidence, evidence }] });

// ---- rule fixtures ----------------------------------------------------------------------

const rules = {};

rules['B1-unacknowledged-refund'] = {
  timeline: timeline([
    purchase('tok_a1', S),
    get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
    grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
    rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
    get('tok_a1', at(S, 10 * SEC), { ack: PENDING_ACK, expiry: E }),
    ledger('write', 'tok_a1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
    voided('tok_a1', at(S, 3 * DAY + 30 * MIN), { messageId: 'm-2' }),
    get('tok_a1', at(S, 3 * DAY + 30 * MIN + SEC), { state: EXPIRED, ack: PENDING_ACK, expiry: at(S, 3 * DAY + 30 * MIN) }),
    ledger('revoke', 'tok_a1', at(S, 3 * DAY + 30 * MIN + 2 * SEC), { messageId: 'm-2', fromState: EXPIRED }),
  ]),
  expected: expect('B1', 'high', 'certain', [0, 6]),
};

rules['B2-ack-while-pending'] = {
  timeline: timeline([
    purchase('tok_p1', S, { productId: 'pack_deluxe', purchaseState: 'PENDING' }),
    productGet('tok_p1', at(S, 2 * SEC), { purchaseState: 'PENDING' }),
    api('products.acknowledge', 'tok_p1', at(S, 3 * SEC)),
    { t: at(S, 2 * HOUR), kind: 'rtdn', notification: 'oneTimeProduct', notificationType: 1, messageId: 'm-1', eventTimeMillis: millis(at(S, 2 * HOUR)), token: 'tok_p1', sku: 'pack_deluxe', endpointStatus: 200 },
    productGet('tok_p1', at(S, 2 * HOUR + SEC), { purchaseState: 'PURCHASED' }),
    grant('tok_p1', at(S, 2 * HOUR + 2 * SEC), { tier: 'deluxe' }),
    api('products.acknowledge', 'tok_p1', at(S, 2 * HOUR + 3 * SEC)),
    ledger('ack', 'tok_p1', at(S, 2 * HOUR + 4 * SEC)),
  ]),
  expected: expect('B2', 'medium', 'certain', [1, 2]),
};

rules['B3-grant-while-pending'] = {
  timeline: timeline([
    purchase('tok_p1', S, { productId: 'pack_deluxe', purchaseState: 'PENDING' }),
    productGet('tok_p1', at(S, 2 * SEC), { purchaseState: 'PENDING' }),
    grant('tok_p1', at(S, 3 * SEC), { tier: 'deluxe' }),
    { t: at(S, 2 * HOUR), kind: 'rtdn', notification: 'oneTimeProduct', notificationType: 1, messageId: 'm-1', eventTimeMillis: millis(at(S, 2 * HOUR)), token: 'tok_p1', sku: 'pack_deluxe', endpointStatus: 200 },
    productGet('tok_p1', at(S, 2 * HOUR + SEC), { purchaseState: 'PURCHASED' }),
    api('products.acknowledge', 'tok_p1', at(S, 2 * HOUR + 2 * SEC)),
    ledger('ack', 'tok_p1', at(S, 2 * HOUR + 3 * SEC)),
  ]),
  expected: expect('B3', 'high', 'certain', [1, 2]),
};

rules['B4-ack-on-renewal'] = {
  timeline: timeline([
    ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
    rtdn(2, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
    get('tok_a1', at(E, 6 * SEC), { expiry: at(E, 31 * DAY) }),
    ledger('expiry', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', expiry: at(E, 31 * DAY), expirySource: 'expiryTime' }),
    api('subscriptions.acknowledge', 'tok_a1', at(E, 8 * SEC)),
  ]),
  expected: expect('B4', 'info', 'certain', [8, 11]),
};

rules['B5-consumable-acknowledged'] = {
  timeline: timeline([
    purchase('tok_c1', S, { productId: 'coins_100' }),
    productGet('tok_c1', at(S, 2 * SEC), { productId: 'coins_100', purchaseState: 'PURCHASED', extra: { quantity: 1 } }),
    grant('tok_c1', at(S, 3 * SEC), { tier: 'coins' }),
    api('products.acknowledge', 'tok_c1', at(S, 4 * SEC)),
    ledger('ack', 'tok_c1', at(S, 5 * SEC)),
  ]),
  expected: expect('B5', 'medium', 'certain', [0, 3]),
};

rules['B6-grant-before-verify'] = {
  timeline: timeline([
    purchase('tok_a1', S),
    grant('tok_a1', at(S, SEC), { expiry: E }),
    get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
    api('subscriptions.acknowledge', 'tok_a1', at(S, 3 * SEC)),
    ledger('ack', 'tok_a1', at(S, 4 * SEC)),
    rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
    get('tok_a1', at(S, 10 * SEC), { expiry: E }),
    ledger('write', 'tok_a1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
  ]),
  expected: expect('B6', 'high', 'certain', [1, 2]),
};

rules['B7-double-grant'] = {
  timeline: timeline([
    purchase('tok_a1', S),
    get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
    grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
    api('subscriptions.acknowledge', 'tok_a1', at(S, 13 * SEC), { status: 0 }),
    ledger('client_response', 'tok_a1', at(S, 14 * SEC), { result: 'error' }),
    get('tok_a1', at(S, 20 * SEC), { ack: PENDING_ACK, expiry: E }),
    grant('tok_a1', at(S, 21 * SEC), { expiry: E }),
    api('subscriptions.acknowledge', 'tok_a1', at(S, 22 * SEC)),
    ledger('ack', 'tok_a1', at(S, 23 * SEC)),
  ]),
  expected: expect('B7', 'high', 'certain', [2, 6]),
};

rules['B8-ack-failed-client-told-success'] = {
  timeline: timeline([
    purchase('tok_a1', S),
    get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
    grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
    api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC), { status: 503 }),
    ledger('client_response', 'tok_a1', at(S, 5 * SEC), { result: 'success' }),
    rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
    get('tok_a1', at(S, 10 * SEC), { ack: PENDING_ACK, expiry: E }),
    ledger('write', 'tok_a1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
  ]),
  expected: expect('B8', 'high', 'certain', [3, 4]),
};

rules['B9-prepaid-unacknowledged'] = {
  timeline: timeline([
    purchase('tok_p1', S, { productId: 'basic_prepaid' }),
    get('tok_p1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: at(S, 3 * DAY), productId: 'basic_prepaid', prepaid: true, planDays: 3 }),
    grant('tok_p1', at(S, 3 * SEC), { expiry: at(S, 3 * DAY), extra: { planType: 'prepaid' } }),
    rtdn(4, 'tok_p1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
    get('tok_p1', at(S, 10 * SEC), { ack: PENDING_ACK, expiry: at(S, 3 * DAY), productId: 'basic_prepaid', prepaid: true, planDays: 3 }),
    ledger('write', 'tok_p1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
    support(at(S, 2 * DAY + 2 * HOUR), 'user says the prepaid plan vanished'),
  ]),
  expected: expect('B9', 'high', 'likely', [0, 1]),
};

rules['C1-duplicate-delivery-applied-twice'] = {
  timeline: timeline([
    ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
    rtdn(2, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
    get('tok_a1', at(E, 6 * SEC), { expiry: at(E, 31 * DAY) }),
    ledger('write', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', note: 'credited 30 days of premium' }),
    rtdn(2, 'tok_a1', at(E, 10 * MIN), { messageId: 'm-2', eventTime: E }),
    get('tok_a1', at(E, 10 * MIN + SEC), { expiry: at(E, 31 * DAY) }),
    ledger('write', 'tok_a1', at(E, 10 * MIN + 2 * SEC), { messageId: 'm-2', note: 'credited 30 days of premium' }),
  ]),
  expected: expect('C1', 'high', 'certain', [8, 10, 11, 13]),
};

const H = '2026-10-03T09:00:00Z'; // the hold, in C2
rules['C2-out-of-order'] = {
  timeline: timeline([
    purchase('tok_a1', S),
    get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
    grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
    api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
    ledger('ack', 'tok_a1', at(S, 5 * SEC)),
    rtdn(5, 'tok_a1', at(H, 5 * SEC), { messageId: 'm-5', eventTime: H }),
    get('tok_a1', at(H, 6 * SEC), { state: ON_HOLD, expiry: E }),
    ledger('revoke', 'tok_a1', at(H, 7 * SEC), { messageId: 'm-5', fromState: ON_HOLD }),
    rtdn(1, 'tok_a1', at(H, HOUR + 5 * SEC), { messageId: 'm-6', eventTime: at(H, HOUR) }),
    get('tok_a1', at(H, HOUR + 6 * SEC), { expiry: at(H, 31 * DAY) }),
    grant('tok_a1', at(H, HOUR + 7 * SEC), { key: 'tok_a1:grant:2', expiry: at(H, 31 * DAY), extra: { messageId: 'm-6' } }),
    rtdn(5, 'tok_a1', at(H, HOUR + 5 * MIN), { messageId: 'm-7', eventTime: at(H, 30 * MIN) }),
    get('tok_a1', at(H, HOUR + 5 * MIN + SEC), { expiry: at(H, 31 * DAY) }),
    ledger('revoke', 'tok_a1', at(H, HOUR + 5 * MIN + 2 * SEC), { messageId: 'm-7', fromState: ON_HOLD }),
  ]),
  expected: expect('C2', 'high', 'likely', [8, 10, 11, 13]),
};

rules['C3-write-without-refetch'] = {
  timeline: timeline([
    purchase('tok_a1', S),
    get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
    grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
    api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
    ledger('ack', 'tok_a1', at(S, 5 * SEC)),
    rtdn(13, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-3', eventTime: E }),
    ledger('revoke', 'tok_a1', at(E, 6 * SEC), { messageId: 'm-3' }),
  ]),
  expected: expect('C3', 'high', 'certain', [5, 6]),
};

rules['C4-no-message-id-revoke'] = {
  timeline: timeline([
    purchase('tok_a1', S),
    get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
    grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
    api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
    ledger('ack', 'tok_a1', at(S, 5 * SEC)),
    rtdn(12, 'tok_a1', at(S, 10 * DAY), { messageId: null, eventTime: at(S, 10 * DAY) }),
    ledger('revoke', 'tok_a1', at(S, 10 * DAY + SEC)),
  ]),
  expected: expect('C4', 'medium', 'certain', [5, 6]),
};

rules['C5-unhandled-type'] = {
  timeline: timeline(
    [
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(19, 'tok_a1', at(S, 9 * DAY), { messageId: 'm-2' }),
    ],
    { policy: { handledNotificationTypes: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13] } },
  ),
  expected: expect('C5', 'medium', 'possible', [8]),
};

rules['C6-pending-refund-review-revoked'] = {
  timeline: timeline([
    ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
    { t: at(S, 4 * DAY), kind: 'rtdn', notification: 'pendingRefundReview', messageId: 'm-2', eventTimeMillis: millis(at(S, 4 * DAY)), token: 'tok_a1', orderId: 'GPA.0000-0000-0000-00000', endpointStatus: 200 },
    get('tok_a1', at(S, 4 * DAY + SEC), { expiry: E }),
    ledger('revoke', 'tok_a1', at(S, 4 * DAY + 2 * SEC), { messageId: 'm-2', note: 'treated the review as a refund' }),
  ]),
  expected: expect('C6', 'high', 'certain', [8, 10]),
};

rules['C7-test-notification-applied'] = {
  timeline: timeline([
    ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
    { t: at(S, DAY), kind: 'rtdn', notification: 'test', messageId: 'm-9', eventTimeMillis: millis(at(S, DAY)), endpointStatus: 200 },
    { t: at(S, DAY + SEC), kind: 'ledger', op: 'write', messageId: 'm-9', note: 'default branch reset the trial flag' },
  ]),
  expected: expect('C7', 'low', 'certain', [8, 9]),
};

const builders = { timeline, purchase, get, productGet, api, ledger, grant, rtdn, voided, support, opening, at, expect, SEC, MIN, HOUR, DAY, S, E, ACTIVE, GRACE, CANCELED, ON_HOLD, PAUSED, EXPIRED, PENDING_ACK };
Object.assign(rules, makeDG(builders), makeAHIJ(builders));
const composites = makeComposites(builders);

// ---- clean fixtures -------------------------------------------------------------------------

const clean = {};

const S1 = '2026-06-01T10:00:00Z';
const E1 = at(S1, 30 * DAY);
const E2 = at(E1, 31 * DAY);
clean['01-purchase-renew-cancel-expire'] = timeline([
  ...opening('tok_a1', S1, { expiry: E1, messageId: 'm-1' }),
  api('voidedpurchases.list', undefined, at(S1, 29 * DAY), { extra: { startTime: at(S1, -DAY) } }),
  rtdn(2, 'tok_a1', at(E1, 5 * SEC), { messageId: 'm-2', eventTime: E1 }),
  get('tok_a1', at(E1, 6 * SEC), { expiry: E2 }),
  ledger('expiry', 'tok_a1', at(E1, 7 * SEC), { messageId: 'm-2', expiry: E2, expirySource: 'expiryTime' }),
  rtdn(3, 'tok_a1', at(E1, 14 * DAY), { messageId: 'm-3' }),
  get('tok_a1', at(E1, 14 * DAY + SEC), { state: CANCELED, expiry: E2, extra: { canceledStateContext: 'userInitiatedCancellation' } }),
  ledger('write', 'tok_a1', at(E1, 14 * DAY + 2 * SEC), { messageId: 'm-3', fromState: CANCELED, note: 'auto-renew off; access kept until expiry' }),
  api('voidedpurchases.list', undefined, at(S1, 59 * DAY), { extra: { startTime: at(S1, 29 * DAY) } }),
  rtdn(13, 'tok_a1', at(E2, 5 * SEC), { messageId: 'm-4', eventTime: E2 }),
  get('tok_a1', at(E2, 6 * SEC), { state: EXPIRED, expiry: E2 }),
  ledger('revoke', 'tok_a1', at(E2, 7 * SEC), { messageId: 'm-4', fromState: EXPIRED }),
]);

const U = at(S, 9 * DAY + 2 * HOUR); // the upgrade, in clean 02
const UE = at(U, 31 * DAY);
clean['02-upgrade-with-invalidation'] = timeline([
  ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
  { t: U, kind: 'app', type: 'launch_billing_flow', productId: 'plus_monthly', replacementMode: 'WITH_TIME_PRORATION', oldToken: 'tok_a1' },
  purchase('tok_b2', at(U, 5 * SEC), { productId: 'plus_monthly', extra: { replacementMode: 'WITH_TIME_PRORATION', oldToken: 'tok_a1' } }),
  get('tok_b2', at(U, 6 * SEC), { ack: PENDING_ACK, expiry: UE, productId: 'plus_monthly', linked: 'tok_a1' }),
  ledger('revoke', 'tok_a1', at(U, 7 * SEC), { note: 'linked token invalidated at replacement' }),
  grant('tok_b2', at(U, 8 * SEC), { tier: 'plus', expiry: UE }),
  api('subscriptions.acknowledge', 'tok_b2', at(U, 9 * SEC)),
  ledger('ack', 'tok_b2', at(U, 10 * SEC)),
  rtdn(4, 'tok_b2', at(U, 12 * SEC), { messageId: 'm-2', eventTime: at(U, 5 * SEC) }),
  get('tok_b2', at(U, 13 * SEC), { expiry: UE, productId: 'plus_monthly', linked: 'tok_a1' }),
  ledger('write', 'tok_b2', at(U, 14 * SEC), { messageId: 'm-2', fromState: ACTIVE }),
  rtdn(13, 'tok_a1', at(U, 20 * SEC), { messageId: 'm-3', eventTime: at(U, 5 * SEC) }),
  get('tok_a1', at(U, 21 * SEC), { state: EXPIRED, expiry: at(U, 5 * SEC), extra: { canceledStateContext: 'replacementCancellation' } }),
  ledger('write', 'tok_a1', at(U, 22 * SEC), { messageId: 'm-3', fromState: EXPIRED, note: 'already revoked at replacement' }),
]);

const G = E; // the grace period starts at the first expiry, in clean 03
clean['03-grace-then-recovery'] = timeline([
  ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
  rtdn(6, 'tok_a1', at(G, 5 * SEC), { messageId: 'm-2', eventTime: G }),
  get('tok_a1', at(G, 6 * SEC), { state: GRACE, expiry: at(G, 7 * DAY) }),
  ledger('expiry', 'tok_a1', at(G, 7 * SEC), { messageId: 'm-2', expiry: at(G, 7 * DAY), expirySource: 'expiryTime', fromState: GRACE, note: 'access kept during grace' }),
  rtdn(1, 'tok_a1', at(G, 2 * DAY), { messageId: 'm-3' }),
  get('tok_a1', at(G, 2 * DAY + SEC), { expiry: at(G, 31 * DAY) }),
  ledger('expiry', 'tok_a1', at(G, 2 * DAY + 2 * SEC), { messageId: 'm-3', expiry: at(G, 31 * DAY), expirySource: 'expiryTime', fromState: ACTIVE }),
  rtdn(2, 'tok_a1', at(G, 2 * DAY + 10 * SEC), { messageId: 'm-4', eventTime: at(G, 2 * DAY) }),
  get('tok_a1', at(G, 2 * DAY + 11 * SEC), { expiry: at(G, 31 * DAY) }),
  ledger('write', 'tok_a1', at(G, 2 * DAY + 12 * SEC), { messageId: 'm-4', fromState: ACTIVE, note: 'expiry unchanged' }),
]);

const P = E; // the pause takes effect at the first expiry, in clean 04
const R = at(P, 31 * DAY); // the resume
clean['04-pause-then-resume'] = timeline([
  ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
  rtdn(11, 'tok_a1', at(S, 19 * DAY), { messageId: 'm-2' }),
  get('tok_a1', at(S, 19 * DAY + SEC), { expiry: E }),
  ledger('write', 'tok_a1', at(S, 19 * DAY + 2 * SEC), { messageId: 'm-2', fromState: ACTIVE, note: 'pause scheduled; access unchanged' }),
  api('voidedpurchases.list', undefined, at(S, 28 * DAY), { extra: { startTime: at(S, -2 * DAY) } }),
  rtdn(10, 'tok_a1', at(P, 5 * SEC), { messageId: 'm-3', eventTime: P }),
  get('tok_a1', at(P, 6 * SEC), { state: PAUSED, expiry: P, extra: { pausedStateContext: { autoResumeTime: R } } }),
  ledger('revoke', 'tok_a1', at(P, 7 * SEC), { messageId: 'm-3', fromState: PAUSED }),
  api('voidedpurchases.list', undefined, at(S, 58 * DAY), { extra: { startTime: at(S, 28 * DAY) } }),
  rtdn(1, 'tok_a1', at(R, 5 * SEC), { messageId: 'm-4', eventTime: R }),
  get('tok_a1', at(R, 6 * SEC), { expiry: at(R, 30 * DAY) }),
  grant('tok_a1', at(R, 7 * SEC), { key: 'tok_a1:grant:2', expiry: at(R, 30 * DAY), extra: { messageId: 'm-4', fromState: ACTIVE } }),
  rtdn(2, 'tok_a1', at(R, 10 * SEC), { messageId: 'm-5', eventTime: R }),
  get('tok_a1', at(R, 11 * SEC), { expiry: at(R, 30 * DAY) }),
  ledger('write', 'tok_a1', at(R, 12 * SEC), { messageId: 'm-5', fromState: ACTIVE }),
]);

const T = at(S, 24 * DAY + 2 * HOUR); // the top-up, in clean 05
const TE = at(S, 60 * DAY);
clean['05-prepaid-with-topup'] = timeline([
  ...opening('tok_p1', S, { expiry: E, productId: 'basic_prepaid', prepaid: true, planDays: 30, messageId: 'm-1', grantExtra: { planType: 'prepaid' } }),
  purchase('tok_p2', T, { productId: 'basic_prepaid', extra: { replacementMode: 'CHARGE_FULL_PRICE', oldToken: 'tok_p1' } }),
  get('tok_p2', at(T, 2 * SEC), { ack: PENDING_ACK, expiry: TE, productId: 'basic_prepaid', prepaid: true, planDays: 30, linked: 'tok_p1' }),
  ledger('revoke', 'tok_p1', at(T, 3 * SEC), { note: 'replaced by the top-up token' }),
  grant('tok_p2', at(T, 4 * SEC), { expiry: TE, extra: { planType: 'prepaid' } }),
  api('subscriptions.acknowledge', 'tok_p2', at(T, 5 * SEC)),
  ledger('ack', 'tok_p2', at(T, 6 * SEC)),
  rtdn(4, 'tok_p2', at(T, 9 * SEC), { messageId: 'm-2', eventTime: T }),
  get('tok_p2', at(T, 10 * SEC), { expiry: TE, productId: 'basic_prepaid', prepaid: true, planDays: 30, linked: 'tok_p1' }),
  ledger('write', 'tok_p2', at(T, 11 * SEC), { messageId: 'm-2', fromState: ACTIVE }),
  api('voidedpurchases.list', undefined, at(S, 29 * DAY), { extra: { startTime: at(S, -DAY) } }),
  api('voidedpurchases.list', undefined, at(S, 59 * DAY), { extra: { startTime: at(S, 29 * DAY) } }),
  rtdn(13, 'tok_p2', at(TE, 5 * SEC), { messageId: 'm-3', eventTime: TE }),
  get('tok_p2', at(TE, 6 * SEC), { state: EXPIRED, expiry: TE, productId: 'basic_prepaid', prepaid: true, planDays: 30 }),
  ledger('revoke', 'tok_p2', at(TE, 7 * SEC), { messageId: 'm-3', fromState: EXPIRED }),
]);

// ---- write ------------------------------------------------------------------------------------------

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const rulesDir = join(root, 'fixtures', 'rules');
const cleanDir = join(root, 'fixtures', 'clean');
const compositeDir = join(root, 'fixtures', 'composite');
mkdirSync(rulesDir, { recursive: true });
mkdirSync(cleanDir, { recursive: true });
mkdirSync(compositeDir, { recursive: true });

// Strip undefined tokens (voidedpurchases.list carries none) and sort events by time.
function finish(tl) {
  tl.events = tl.events
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return tl;
}

for (const [name, { timeline: tl, expected }] of Object.entries(rules)) {
  writeFileSync(join(rulesDir, `${name}.json`), `${JSON.stringify(finish(tl), null, 2)}\n`);
  writeFileSync(join(rulesDir, `${name}.expected.json`), `${JSON.stringify(expected, null, 2)}\n`);
}
for (const [name, tl] of Object.entries(clean)) {
  writeFileSync(join(cleanDir, `${name}.json`), `${JSON.stringify(finish(tl), null, 2)}\n`);
}
for (const [name, tl] of Object.entries(composites)) {
  writeFileSync(join(compositeDir, `${name}.json`), `${JSON.stringify(finish(tl), null, 2)}
`);
}
console.log(`wrote ${Object.keys(rules).length} rule fixtures, ${Object.keys(clean).length} clean fixtures and ${Object.keys(composites).length} composite timelines`);
