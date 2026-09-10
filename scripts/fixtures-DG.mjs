// Rule fixtures for groups D, E, F and G. Imported by scripts/fixtures.mjs,
// which owns the builders and the writing; this file only describes timelines.

export function makeFixtures(b) {
  const { timeline, purchase, get, productGet, api, ledger, grant, rtdn, voided, support, opening, at, expect } = b;
  const { SEC, MIN, HOUR, DAY, S, E, ACTIVE, GRACE, CANCELED, ON_HOLD, PAUSED, EXPIRED, PENDING_ACK } = b;
  const rules = {};

  // ---- D. State interpretation ----

  rules['D1-expiry-from-notification-time'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(2, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { expiry: at(E, 31 * DAY) }),
      ledger('expiry', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', expiry: at(E, 30 * DAY), expirySource: 'eventTimeMillis' }),
    ]),
    expected: expect('D1', 'high', 'certain', [9, 10]),
  };

  rules['D2-canceled-revoked-early'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(3, 'tok_a1', at(S, 14 * DAY), { messageId: 'm-2' }),
      get('tok_a1', at(S, 14 * DAY + SEC), { state: CANCELED, expiry: E, extra: { canceledStateContext: 'userInitiatedCancellation' } }),
      ledger('revoke', 'tok_a1', at(S, 14 * DAY + 2 * SEC), { messageId: 'm-2', fromState: CANCELED }),
    ]),
    expected: expect('D2', 'high', 'certain', [9, 10]),
  };

  rules['D3-grace-revoked'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(6, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { state: GRACE, expiry: at(E, 7 * DAY) }),
      ledger('revoke', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: GRACE }),
    ]),
    expected: expect('D3', 'high', 'certain', [9, 10]),
  };

  rules['D4-on-hold-kept-access'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(5, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { state: ON_HOLD, expiry: E }),
      ledger('write', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: ON_HOLD, note: 'logged; access left in place' }),
      support(at(E, 20 * DAY), 'user on account hold is still using the paid tier'),
    ]),
    expected: expect('D4', 'high', 'likely', [2, 9]),
  };

  rules['D5-paused-kept-access'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(10, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { state: PAUSED, expiry: E, extra: { pausedStateContext: { autoResumeTime: at(E, 31 * DAY) } } }),
      ledger('write', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: PAUSED, note: 'logged; access left in place' }),
    ]),
    expected: expect('D5', 'high', 'likely', [2, 9]),
  };

  rules['D6-expired-still-granting'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(13, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { state: EXPIRED, expiry: E }),
      ledger('write', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: EXPIRED, note: 'logged only' }),
    ]),
    expected: expect('D6', 'high', 'likely', [2, 9]),
  };

  const twoItems = [
    { productId: 'explorer', expiryTime: E, autoRenewingPlan: true },
    { productId: 'addon_extra', expiryTime: at(E, 10 * DAY), autoRenewingPlan: true },
  ];
  rules['D7-only-first-line-item'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, extra: { lineItems: twoItems } }),
      grant('tok_a1', at(S, 3 * SEC), { expiry: E, extra: { lineItemsRead: 1 } }),
      api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
      ledger('ack', 'tok_a1', at(S, 5 * SEC)),
      rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      get('tok_a1', at(S, 10 * SEC), { extra: { lineItems: twoItems } }),
      ledger('write', 'tok_a1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
    ]),
    expected: expect('D7', 'medium', 'certain', [1, 2]),
  };

  rules['D8-v1-get'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E, extra: { call: 'subscriptions.get' } }),
      grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
      api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
      ledger('ack', 'tok_a1', at(S, 5 * SEC)),
      rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      get('tok_a1', at(S, 10 * SEC), { expiry: E, extra: { call: 'subscriptions.get' } }),
      ledger('write', 'tok_a1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
    ]),
    expected: expect('D8', 'low', 'certain', [1]),
  };

  rules['D9-test-purchase-counted'] = {
    timeline: timeline([
      purchase('tok_t1', S),
      get('tok_t1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: at(S, 5 * MIN), extra: { testPurchase: true } }),
      grant('tok_t1', at(S, 3 * SEC), { expiry: at(S, 5 * MIN), extra: { test: true } }),
      api('subscriptions.acknowledge', 'tok_t1', at(S, 4 * SEC)),
      ledger('ack', 'tok_t1', at(S, 5 * SEC), { test: true }),
      rtdn(4, 'tok_t1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      get('tok_t1', at(S, 10 * SEC), { expiry: at(S, 5 * MIN), extra: { testPurchase: true } }),
      ledger('write', 'tok_t1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE, test: true }),
      ledger('count', 'tok_t1', at(S, HOUR), { metric: 'revenue', test: true }),
    ]),
    expected: expect('D9', 'medium', 'certain', [1, 8]),
  };

  rules['D10-prepaid-as-autorenewing'] = {
    timeline: timeline([
      purchase('tok_p1', S, { productId: 'explorer_prepaid' }),
      get('tok_p1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E, productId: 'explorer_prepaid', prepaid: true, planDays: 30 }),
      grant('tok_p1', at(S, 3 * SEC), { expiry: E, extra: { planType: 'auto-renewing' } }),
      api('subscriptions.acknowledge', 'tok_p1', at(S, 4 * SEC)),
      ledger('ack', 'tok_p1', at(S, 5 * SEC)),
      rtdn(4, 'tok_p1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      get('tok_p1', at(S, 10 * SEC), { expiry: E, productId: 'explorer_prepaid', prepaid: true, planDays: 30 }),
      ledger('write', 'tok_p1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
    ]),
    expected: expect('D10', 'medium', 'certain', [1, 2]),
  };

  // ---- E. Lifecycle events ----

  rules['E1-recovered-no-regrant'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(5, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { state: ON_HOLD, expiry: E }),
      ledger('revoke', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: ON_HOLD }),
      rtdn(1, 'tok_a1', at(E, 2 * DAY), { messageId: 'm-3' }),
      get('tok_a1', at(E, 2 * DAY + SEC), { expiry: at(E, 31 * DAY) }),
      ledger('write', 'tok_a1', at(E, 2 * DAY + 2 * SEC), { messageId: 'm-3', fromState: ACTIVE, note: 'logged only' }),
    ]),
    expected: expect('E1', 'high', 'likely', [10, 11]),
  };

  rules['E2-restarted-new-token'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(3, 'tok_a1', at(S, 10 * DAY), { messageId: 'm-2' }),
      get('tok_a1', at(S, 10 * DAY + SEC), { state: CANCELED, expiry: E, extra: { canceledStateContext: 'userInitiatedCancellation' } }),
      ledger('write', 'tok_a1', at(S, 10 * DAY + 2 * SEC), { messageId: 'm-2', fromState: CANCELED }),
      rtdn(7, 'tok_a1', at(S, 15 * DAY), { messageId: 'm-3' }),
      get('tok_a1', at(S, 15 * DAY + SEC), { expiry: E }),
      ledger('write', 'tok_a1r', at(S, 15 * DAY + 2 * SEC), { userId: 'u_1', note: 'created a second subscription row for the restart' }),
    ]),
    expected: expect('E2', 'medium', 'certain', [11, 13]),
  };

  rules['E3-deferred-old-expiry'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      api('subscriptionsv2.defer', 'tok_a1', at(S, 5 * DAY)),
      rtdn(9, 'tok_a1', at(S, 5 * DAY + 5 * SEC), { messageId: 'm-2' }),
      get('tok_a1', at(S, 5 * DAY + 6 * SEC), { expiry: at(E, 30 * DAY) }),
      ledger('write', 'tok_a1', at(S, 5 * DAY + 7 * SEC), { messageId: 'm-2', fromState: ACTIVE, note: 'logged only' }),
    ]),
    expected: expect('E3', 'medium', 'likely', [9, 10]),
  };

  rules['E4-hardcoded-grace-hold'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1' })], { policy: { gracePeriodDays: 7, accountHoldDays: 30 } }),
    expected: expect('E4', 'info', 'possible', []),
  };

  rules['E5-cancellation-scheduled-immediate'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(18, 'tok_a1', at(S, 10 * DAY), { messageId: 'm-2' }),
      get('tok_a1', at(S, 10 * DAY + SEC), { expiry: E }),
      ledger('revoke', 'tok_a1', at(S, 10 * DAY + 2 * SEC), { messageId: 'm-2', note: 'treated the scheduled cancellation as final' }),
    ]),
    expected: expect('E5', 'medium', 'certain', [8, 10]),
  };

  rules['E6-type-8-handled'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1' })], {
      policy: { handledNotificationTypes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
    }),
    expected: expect('E6', 'info', 'possible', []),
  };

  // ---- F. Upgrades and linked tokens ----

  const U = at(S, 9 * DAY + 2 * HOUR);
  const UE = at(U, 31 * DAY);
  const upgradeTail = (mode, grantExtra = {}, grantExpiry = UE) => [
    { t: U, kind: 'app', type: 'launch_billing_flow', productId: 'master', replacementMode: mode, oldToken: 'tok_a1' },
    purchase('tok_b2', at(U, 5 * SEC), { productId: 'master', extra: { replacementMode: mode, oldToken: 'tok_a1' } }),
    get('tok_b2', at(U, 6 * SEC), { ack: PENDING_ACK, expiry: UE, productId: 'master', linked: 'tok_a1' }),
    grant('tok_b2', at(U, 8 * SEC), { tier: 'premium', expiry: grantExpiry, ...grantExtra }),
    api('subscriptions.acknowledge', 'tok_b2', at(U, 9 * SEC)),
    ledger('ack', 'tok_b2', at(U, 10 * SEC)),
    rtdn(4, 'tok_b2', at(U, 12 * SEC), { messageId: 'm-2', eventTime: at(U, 5 * SEC) }),
    get('tok_b2', at(U, 13 * SEC), { expiry: UE, productId: 'master', linked: 'tok_a1' }),
    ledger('write', 'tok_b2', at(U, 14 * SEC), { messageId: 'm-2', fromState: ACTIVE }),
  ];

  rules['F1-linked-token-still-granting'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }), ...upgradeTail('WITH_TIME_PRORATION')]),
    expected: expect('F1', 'high', 'likely', [2, 10]),
  };

  rules['F2-deferred-granted-early'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      { t: U, kind: 'app', type: 'launch_billing_flow', productId: 'master', replacementMode: 'DEFERRED', oldToken: 'tok_a1' },
      purchase('tok_b2', at(U, 5 * SEC), { productId: 'master', extra: { replacementMode: 'DEFERRED', oldToken: 'tok_a1' } }),
      get('tok_b2', at(U, 6 * SEC), {
        ack: PENDING_ACK,
        productId: 'master',
        linked: 'tok_a1',
        extra: {
          lineItems: [
            { productId: 'explorer', expiryTime: E, autoRenewingPlan: { autoRenewEnabled: false }, deferredItemReplacement: { productId: 'master' } },
            { productId: 'master', expiryTime: at(E, 30 * DAY), autoRenewingPlan: true },
          ],
        },
      }),
      ledger('revoke', 'tok_a1', at(U, 7 * SEC), { note: 'linked token invalidated' }),
      grant('tok_b2', at(U, 8 * SEC), { tier: 'premium', expiry: at(E, 30 * DAY) }),
      api('subscriptions.acknowledge', 'tok_b2', at(U, 9 * SEC)),
      ledger('ack', 'tok_b2', at(U, 10 * SEC)),
      rtdn(4, 'tok_b2', at(U, 12 * SEC), { messageId: 'm-2', eventTime: at(U, 5 * SEC) }),
      get('tok_b2', at(U, 13 * SEC), {
        productId: 'master',
        linked: 'tok_a1',
        extra: {
          lineItems: [
            { productId: 'explorer', expiryTime: E, autoRenewingPlan: { autoRenewEnabled: false }, deferredItemReplacement: { productId: 'master' } },
            { productId: 'master', expiryTime: at(E, 30 * DAY), autoRenewingPlan: true },
          ],
        },
      }),
      ledger('write', 'tok_b2', at(U, 14 * SEC), { messageId: 'm-2', fromState: ACTIVE }),
    ]),
    expected: expect('F2', 'medium', 'certain', [9, 12]),
  };

  rules['F3-resignup-same-token'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(3, 'tok_a1', at(S, 5 * DAY), { messageId: 'm-2' }),
      get('tok_a1', at(S, 5 * DAY + SEC), { state: CANCELED, expiry: E, extra: { canceledStateContext: 'userInitiatedCancellation' } }),
      ledger('write', 'tok_a1', at(S, 5 * DAY + 2 * SEC), { messageId: 'm-2', fromState: CANCELED }),
      purchase('tok_c3', at(S, 8 * DAY)),
      get('tok_c3', at(S, 8 * DAY + 2 * SEC), { ack: PENDING_ACK, expiry: E, linked: 'tok_a1' }),
      ledger('expiry', 'tok_a1', at(S, 8 * DAY + 3 * SEC), { expiry: E, expirySource: 'expiryTime', note: 're-signup: refreshed the existing row' }),
      api('subscriptions.acknowledge', 'tok_c3', at(S, 8 * DAY + 4 * SEC)),
      ledger('ack', 'tok_c3', at(S, 8 * DAY + 5 * SEC)),
    ]),
    expected: expect('F3', 'medium', 'certain', [12, 13]),
  };

  rules['F4-expiry-not-reread'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      ...upgradeTail('WITH_TIME_PRORATION', { expirySource: 'previous_token' }, E).flatMap((e, n) =>
        n === 3 ? [ledger('revoke', 'tok_a1', at(U, 7 * SEC), { note: 'linked token invalidated' }), e] : [e],
      ),
    ]),
    expected: expect('F4', 'medium', 'certain', [9, 10, 12]),
  };

  // ---- G. Refunds, revocations, voided purchases ----

  rules['G1-revoked-still-granting'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(12, 'tok_a1', at(S, 10 * DAY), { messageId: 'm-2' }),
      support(at(S, 11 * DAY), 'user was refunded by Google and still has the paid tier'),
    ]),
    expected: expect('G1', 'high', 'likely', [2, 8]),
  };

  rules['G2-void-then-active'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      voided('tok_a1', at(S, 3 * DAY), { messageId: 'm-2' }),
      get('tok_a1', at(S, 3 * DAY + SEC), { expiry: E }),
      ledger('write', 'tok_a1', at(S, 3 * DAY + 2 * SEC), { messageId: 'm-2', fromState: ACTIVE, note: 'state says active; kept the tier' }),
    ]),
    expected: expect('G2', 'high', 'certain', [8, 9]),
  };

  rules['G3-partial-refund-full-revoke'] = {
    timeline: timeline([
      purchase('tok_c1', S, { productId: 'gems_100', extra: { quantity: 3 } }),
      productGet('tok_c1', at(S, 2 * SEC), { productId: 'gems_100', purchaseState: 'PURCHASED', extra: { quantity: 3 } }),
      grant('tok_c1', at(S, 3 * SEC), { tier: 'gems' }),
      api('products.consume', 'tok_c1', at(S, 4 * SEC)),
      ledger('consume', 'tok_c1', at(S, 5 * SEC)),
      voided('tok_c1', at(S, 2 * DAY), { messageId: 'm-2', refundType: 2, productType: 2 }),
      productGet('tok_c1', at(S, 2 * DAY + SEC), { productId: 'gems_100', purchaseState: 'PURCHASED', ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', extra: { quantity: 3, refundableQuantity: 2 } }),
      ledger('revoke', 'tok_c1', at(S, 2 * DAY + 2 * SEC), { messageId: 'm-2' }),
    ]),
    expected: expect('G3', 'medium', 'certain', [5, 7]),
  };

  rules['G4-no-voided-sweep'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1' })], { policy: { voidedPurchasesSweep: false } }),
    expected: expect('G4', 'medium', 'certain', []),
  };

  rules['G5-refund-without-revoke'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      api('orders.refund', 'tok_a1', at(S, 2 * DAY), { extra: { revoke: false } }),
      ledger('write', 'tok_a1', at(S, 2 * DAY + SEC), { note: 'refund issued after a complaint' }),
    ]),
    expected: expect('G5', 'high', 'certain', [8]),
  };

  rules['G6-cancel-where-revoke-meant'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      api('subscriptionsv2.cancel', 'tok_a1', at(S, 2 * DAY)),
      ledger('revoke', 'tok_a1', at(S, 2 * DAY + SEC), { note: 'ended access after cancelling at Google' }),
    ]),
    expected: expect('G6', 'medium', 'certain', [8, 9]),
  };

  return rules;
}
