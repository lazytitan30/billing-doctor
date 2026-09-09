// Composite fixtures: realistic weeks that produce several findings. The
// ordering and the evidence indexes are the test. Imported by
// scripts/fixtures.mjs; the expected findings live beside each file and were
// reviewed by hand before being frozen.

export function makeComposites(b) {
  const { timeline, purchase, get, productGet, api, ledger, grant, rtdn, voided, support, opening, at } = b;
  const { SEC, MIN, HOUR, DAY, S, E, ACTIVE, GRACE, PENDING_ACK } = b;
  const composites = {};

  // A week: an upgrade whose old token is never invalidated, the upgrade's
  // notification delivered twice and applied twice, then a refund the state
  // read disagrees with.
  const U = at(S, 3 * DAY);
  const UE = at(U, 31 * DAY);
  composites['01-week-upgrade-refund-duplicate'] = timeline([
    ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
    { t: U, kind: 'app', type: 'launch_billing_flow', productId: 'master', replacementMode: 'WITH_TIME_PRORATION', oldToken: 'tok_a1' },
    purchase('tok_b2', at(U, 5 * SEC), { productId: 'master', extra: { replacementMode: 'WITH_TIME_PRORATION', oldToken: 'tok_a1' } }),
    get('tok_b2', at(U, 6 * SEC), { ack: PENDING_ACK, expiry: UE, productId: 'master', linked: 'tok_a1' }),
    grant('tok_b2', at(U, 8 * SEC), { tier: 'premium', expiry: UE }),
    api('subscriptions.acknowledge', 'tok_b2', at(U, 9 * SEC)),
    ledger('ack', 'tok_b2', at(U, 10 * SEC)),
    rtdn(4, 'tok_b2', at(U, 12 * SEC), { messageId: 'm-2', eventTime: at(U, 5 * SEC) }),
    get('tok_b2', at(U, 13 * SEC), { expiry: UE, productId: 'master', linked: 'tok_a1' }),
    ledger('write', 'tok_b2', at(U, 14 * SEC), { messageId: 'm-2', note: 'credited the upgrade bonus' }),
    rtdn(4, 'tok_b2', at(U, 10 * MIN), { messageId: 'm-2', eventTime: at(U, 5 * SEC) }),
    get('tok_b2', at(U, 10 * MIN + SEC), { expiry: UE, productId: 'master', linked: 'tok_a1' }),
    ledger('write', 'tok_b2', at(U, 10 * MIN + 2 * SEC), { messageId: 'm-2', note: 'credited the upgrade bonus' }),
    voided('tok_b2', at(S, 6 * DAY), { messageId: 'm-3' }),
    get('tok_b2', at(S, 6 * DAY + SEC), { expiry: UE, productId: 'master', linked: 'tok_a1' }),
    ledger('write', 'tok_b2', at(S, 6 * DAY + 2 * SEC), { messageId: 'm-3', fromState: ACTIVE, note: 'state says active; kept the tier' }),
    support(at(S, 7 * DAY), 'user was refunded and still has both tiers'),
  ]);

  // A month of payment trouble: grace period treated as a loss of access,
  // recovery never re-granted, then a renewal written from the notification
  // time without a fetch.
  composites['02-payment-trouble'] = timeline([
    ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
    rtdn(6, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
    get('tok_a1', at(E, 6 * SEC), { state: GRACE, expiry: at(E, 7 * DAY) }),
    ledger('revoke', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: GRACE }),
    rtdn(1, 'tok_a1', at(E, 2 * DAY), { messageId: 'm-3' }),
    get('tok_a1', at(E, 2 * DAY + SEC), { expiry: at(E, 31 * DAY) }),
    ledger('write', 'tok_a1', at(E, 2 * DAY + 2 * SEC), { messageId: 'm-3', fromState: ACTIVE, note: 'logged only' }),
    rtdn(2, 'tok_a1', at(E, 2 * DAY + 10 * SEC), { messageId: 'm-4', eventTime: at(E, 2 * DAY) }),
    ledger('expiry', 'tok_a1', at(E, 2 * DAY + 11 * SEC), { messageId: 'm-4', expiry: at(E, 32 * DAY), expirySource: 'eventTimeMillis' }),
    support(at(E, 3 * DAY), 'user fixed their card and still cannot get in'),
  ]);

  // A support ticket: a consumable acknowledged instead of consumed, a
  // chargeback review answered by revoking, a partial refund revoking the
  // whole purchase, and a notification type nobody handles.
  composites['03-support-ticket'] = timeline(
    [
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      purchase('tok_c1', at(S, HOUR), { productId: 'gems_100', extra: { quantity: 3 } }),
      productGet('tok_c1', at(S, HOUR + 2 * SEC), { productId: 'gems_100', purchaseState: 'PURCHASED', extra: { quantity: 3 } }),
      grant('tok_c1', at(S, HOUR + 3 * SEC), { tier: 'gems' }),
      api('products.acknowledge', 'tok_c1', at(S, HOUR + 4 * SEC)),
      ledger('ack', 'tok_c1', at(S, HOUR + 5 * SEC)),
      { t: at(S, 2 * DAY), kind: 'rtdn', notification: 'pendingRefundReview', messageId: 'm-2', eventTimeMillis: Date.parse(at(S, 2 * DAY)), token: 'tok_a1', orderId: 'GPA.0000-0000-0000-00000', endpointStatus: 200 },
      get('tok_a1', at(S, 2 * DAY + SEC), { expiry: E }),
      ledger('revoke', 'tok_a1', at(S, 2 * DAY + 2 * SEC), { messageId: 'm-2', note: 'treated the review as a refund' }),
      voided('tok_c1', at(S, 3 * DAY), { messageId: 'm-3', refundType: 2, productType: 2 }),
      productGet('tok_c1', at(S, 3 * DAY + SEC), { productId: 'gems_100', purchaseState: 'PURCHASED', ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', extra: { quantity: 3, refundableQuantity: 2 } }),
      ledger('revoke', 'tok_c1', at(S, 3 * DAY + 2 * SEC), { messageId: 'm-3' }),
      rtdn(20, 'tok_a1', at(S, 4 * DAY), { messageId: 'm-4' }),
      support(at(S, 5 * DAY), 'user asks why the gems and the subscription both vanished'),
    ],
    { policy: { handledNotificationTypes: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13] } },
  );

  return composites;
}
