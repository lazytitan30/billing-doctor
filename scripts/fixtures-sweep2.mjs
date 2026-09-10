// Rule fixtures for the second sweep (2026-09-10): the device group K, and the
// twelve rules added to the existing groups. Imported by scripts/fixtures.mjs,
// which owns the builders and the writing; this file only describes timelines.
//
// Group K describes what the app on the phone did. Google's numeric
// BillingResponseCode is present where a native app can see it, and absent
// where a wrapper hides it, because the rules have to work either way.

export function makeFixtures(b) {
  const { timeline, purchase, get, productGet, api, ledger, grant, rtdn, support, opening, at, expect } = b;
  const { SEC, MIN, HOUR, DAY, S, E, ACTIVE, CANCELED, PENDING_ACK, ACKED } = b;
  const rules = {};

  // A device event. `type` is one of APP_EVENT_TYPES; everything else is optional.
  const app = (type, t, o = {}) => ({ t, kind: 'app', type, ...o });
  // How every device timeline opens: launch, connect, and the query of existing
  // purchases that Google asks for on connection (H4), so these fixtures are
  // about the fault they describe and nothing else.
  const boot = (start) => [
    app('app_start', start),
    app('billing_connected', at(start, 400)),
    app('query_purchases', at(start, 600)),
  ];

  // ---- A. Configuration and permissions ----

  // A one-time product sold with its notifications switched off in the Console.
  rules['A7-one-time-notifications-off'] = {
    timeline: timeline(
      [
        purchase('tok_d1', S, { productId: 'pack_deluxe' }),
        productGet('tok_d1', at(S, 2 * SEC), { purchaseState: 'PURCHASED' }),
        grant('tok_d1', at(S, 3 * SEC), { tier: 'deluxe' }),
        api('products.acknowledge', 'tok_d1', at(S, 4 * SEC)),
        ledger('ack', 'tok_d1', at(S, 5 * SEC)),
        support(at(S, 2 * DAY), 'a refunded pack stayed unlocked; the endpoint log has no one-time notifications at all'),
      ],
      { config: { rtdn: { pushEndpointAuth: 'oidc', oneTimeProductNotifications: false } } },
    ),
    expected: expect('A7', 'medium', 'certain', [0]),
  };

  // ---- B. Purchase and acknowledgement ----

  // Three bought, one granted. The ledger says so itself.
  rules['B10-multi-quantity-granted-once'] = {
    timeline: timeline([
      purchase('tok_c1', S, { productId: 'coins_100', extra: { quantity: 3 } }),
      productGet('tok_c1', at(S, 2 * SEC), { productId: 'coins_100', purchaseState: 'PURCHASED', extra: { quantity: 3 } }),
      grant('tok_c1', at(S, 3 * SEC), { tier: 'coins', extra: { quantityGranted: 1 } }),
      api('products.consume', 'tok_c1', at(S, 4 * SEC)),
      ledger('consume', 'tok_c1', at(S, 5 * SEC)),
    ]),
    expected: expect('B10', 'high', 'certain', [0, 2]),
  };

  // Google refuses a plan change while the subscription being replaced is
  // still unacknowledged, and the user is shown nothing that explains it.
  rules['B11-plan-change-while-unacknowledged'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
      grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
      app('launch_billing_flow', at(S, DAY), {
        productId: 'plus_monthly',
        oldToken: 'tok_a1',
        replacementMode: 'WITH_TIME_PRORATION',
      }),
    ]),
    expected: expect('B11', 'medium', 'certain', [1, 3]),
  };

  // ---- C. Notifications ----

  // One delivery, answered 500, and no ledger write carries the id. Pub/Sub
  // keeps the message; the renewal it announced was never applied.
  rules['C8-notification-never-applied'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(2, 'tok_a1', at(S, 30 * DAY), { messageId: 'm-2', status: 500 }),
    ]),
    expected: expect('C8', 'high', 'certain', [8]),
  };

  // ---- D. The Developer API ----

  // A token queried long after the subscription ended answers 410, and 410 is
  // not "no entitlement".
  rules['D11-token-past-sixty-days'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      get('tok_a1', at(S, 95 * DAY), {
        status: 410,
        extra: { subscriptionState: undefined, acknowledgementState: undefined, externalAccountIdentifiers: undefined },
      }),
    ]),
    expected: expect('D11', 'medium', 'certain', [6, 8]),
  };

  // ---- E. Pause, resume, cancellation ----

  // A pause scheduled for the next renewal, treated as a pause now.
  rules['E7-scheduled-pause-revoked'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(11, 'tok_a1', at(S, 10 * DAY), { messageId: 'm-2' }),
      get('tok_a1', at(S, 10 * DAY + SEC), { expiry: E }),
      ledger('revoke', 'tok_a1', at(S, 10 * DAY + 2 * SEC), { messageId: 'm-2', note: 'pause scheduled' }),
    ]),
    expected: expect('E7', 'medium', 'certain', [8, 10]),
  };

  // The price went up, the user never agreed, Google cancelled it. That is not
  // the same as a user who decided to leave.
  rules['E8-price-increase-cancellation'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(19, 'tok_a1', at(S, 10 * DAY), { messageId: 'm-2' }),
      get('tok_a1', at(S, 10 * DAY + SEC), { expiry: E }),
      ledger('write', 'tok_a1', at(S, 10 * DAY + 2 * SEC), { messageId: 'm-2', fromState: ACTIVE }),
      rtdn(3, 'tok_a1', at(S, 20 * DAY), { messageId: 'm-3' }),
      get('tok_a1', at(S, 20 * DAY + SEC), { state: CANCELED, expiry: E }),
      ledger('write', 'tok_a1', at(S, 20 * DAY + 2 * SEC), { messageId: 'm-3', fromState: CANCELED }),
    ]),
    expected: expect('E8', 'info', 'possible', [8, 11]),
  };

  // ---- F. Replacement, upgrade, resubscribe ----

  // A resubscribe made from the Play Store after the old one fully lapsed. The
  // link to the old account is in outOfAppPurchaseContext and nowhere else.
  rules['F5-out-of-app-resubscribe-unlinked'] = {
    timeline: timeline([
      purchase('tok_b2', S, { extra: { obfuscatedAccountId: undefined } }),
      get('tok_b2', at(S, 2 * SEC), {
        ack: PENDING_ACK,
        expiry: E,
        extra: {
          externalAccountIdentifiers: undefined,
          outOfAppPurchaseContext: {
            expiredPurchaseToken: 'tok_a1',
            expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: 'hm_1' },
          },
        },
      }),
      ledger('lookup', 'tok_b2', at(S, 3 * SEC), { lookup: 'pseudonym', matchedUsers: 0 }),
      api('subscriptions.acknowledge', 'tok_b2', at(S, 4 * SEC)),
      ledger('ack', 'tok_b2', at(S, 5 * SEC)),
      support(at(S, HOUR), 'user resubscribed from the Play Store and the app still shows them as lapsed'),
    ]),
    expected: expect('F5', 'high', 'certain', [1, 2]),
  };

  // An upgrade launched without the obfuscated account id the old subscription
  // carried. Every later notification for the new token arrives anonymous.
  rules['F6-upgrade-without-account-id'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      purchase('tok_b2', at(S, 10 * DAY), {
        productId: 'plus_monthly',
        extra: { obfuscatedAccountId: undefined, oldToken: 'tok_a1', replacementMode: 'WITH_TIME_PRORATION' },
      }),
      get('tok_b2', at(S, 10 * DAY + 2 * SEC), {
        ack: PENDING_ACK,
        expiry: at(S, 40 * DAY),
        productId: 'plus_monthly',
        linked: 'tok_a1',
        extra: { externalAccountIdentifiers: undefined },
      }),
      ledger('revoke', 'tok_a1', at(S, 10 * DAY + 3 * SEC), { note: 'replaced by tok_b2' }),
      grant('tok_b2', at(S, 10 * DAY + 4 * SEC), { tier: 'plus', expiry: at(S, 40 * DAY) }),
      api('subscriptions.acknowledge', 'tok_b2', at(S, 10 * DAY + 5 * SEC)),
      ledger('ack', 'tok_b2', at(S, 10 * DAY + 6 * SEC)),
    ]),
    expected: expect('F6', 'medium', 'certain', [6, 8]),
  };

  // ---- G. Refunds and revocations ----

  // Refunding last month's order returns the money and changes nothing about
  // the subscription, which is still running.
  rules['G7-refund-of-older-order'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      get('tok_a1', at(S, 40 * DAY), { expiry: at(S, 60 * DAY), extra: { latestOrderId: 'GPA.0000-0000-0000-00001..1' } }),
      api('orders.refund', 'tok_a1', at(S, 40 * DAY + SEC), { extra: { orderId: 'GPA.0000-0000-0000-00001' } }),
      ledger('revoke', 'tok_a1', at(S, 40 * DAY + 2 * SEC), { note: 'refund means the subscription is over' }),
    ]),
    expected: expect('G7', 'medium', 'certain', [8, 9, 10]),
  };

  // ---- I. Testing ----

  // A license tester purchase left unacknowledged. Google refunds it after
  // three minutes, and the same fault refunds real ones after three days.
  rules['I6-tester-not-acknowledged'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E, extra: { testPurchase: true } }),
      grant('tok_a1', at(S, 3 * SEC), { expiry: E, extra: { test: true } }),
      support(at(S, 20 * MIN), 'the tester was emailed a cancellation minutes after buying; nobody changed anything'),
    ]),
    expected: expect('I6', 'medium', 'likely', [0, 1]),
  };

  // ---- J. Ledger integrity ----

  // Keyed on the order id: absent on promo purchases, different on every renewal.
  rules['J5-keyed-on-order-id'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
      grant('tok_a1', at(S, 3 * SEC), { expiry: E, extra: { keyedOn: 'orderId' } }),
      api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
      ledger('ack', 'tok_a1', at(S, 5 * SEC)),
    ]),
    expected: expect('J5', 'medium', 'certain', [2]),
  };

  // ---- K. The device and the Play Billing Library ----

  // The catalogue came back empty, so the shop has nothing to sell.
  rules['K1-empty-catalogue'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 3, returned: 0, durationMs: 180 }),
      support(at(S, 5 * MIN), 'the shop shows no prices on any device, including the reviewer devices'),
    ]),
    expected: expect('K1', 'high', 'certain', [3]),
  };

  // The call ran while the client was not connected. Google's own code says
  // the connection drops when the Play Store updates itself.
  rules['K2-call-while-disconnected'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 3, responseCode: -1, errorMessage: 'Service disconnected' }),
      app('query_products', at(S, 32 * SEC), { requested: 3, returned: 3, responseCode: 0, durationMs: 210 }),
    ]),
    expected: expect('K2', 'medium', 'certain', [3]),
  };

  // Already owned, and nobody looked for what the user owns.
  rules['K3-already-owned-not-investigated'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 3, returned: 3, durationMs: 200 }),
      app('launch_billing_flow', at(S, 40 * SEC), { productId: 'coins_100', responseCode: 7 }),
      support(at(S, 30 * MIN), 'user cannot buy coins again; the button does nothing and support has three tickets like it'),
    ]),
    expected: expect('K3', 'high', 'certain', [4]),
  };

  // The shop offered a product the user already holds.
  rules['K4-flow-for-owned-product'] = {
    timeline: timeline(
      [
        purchase('tok_d1', S, { productId: 'pack_deluxe' }),
        productGet('tok_d1', at(S, 2 * SEC), { purchaseState: 'PURCHASED' }),
        grant('tok_d1', at(S, 3 * SEC), { tier: 'deluxe' }),
        api('products.acknowledge', 'tok_d1', at(S, 4 * SEC)),
        ledger('ack', 'tok_d1', at(S, 5 * SEC)),
        app('launch_billing_flow', at(S, 2 * DAY), { productId: 'pack_deluxe' }),
      ],
      { config: { rtdn: { pushEndpointAuth: 'oidc', oneTimeProductNotifications: true } } },
    ),
    expected: expect('K4', 'medium', 'certain', [0, 5]),
  };

  // A network blip that nobody retried.
  rules['K5-recoverable-failure-no-retry'] = {
    timeline: timeline([
      ...boot(S),
      app('query_purchases', at(S, 2 * SEC), { responseCode: 12, errorMessage: 'Network error' }),
      support(at(S, 30 * MIN), 'restored purchases came back empty for a user who definitely has a subscription'),
    ]),
    expected: expect('K5', 'medium', 'likely', [3]),
  };

  // DEVELOPER_ERROR: the arguments are wrong and every attempt fails the same way.
  rules['K6-developer-error'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 1, returned: 1, durationMs: 190 }),
      app('launch_billing_flow', at(S, 20 * SEC), {
        productId: 'basic_monthly',
        responseCode: 5,
        errorMessage: 'DEVELOPER_ERROR: SkuDetails/offer token missing',
      }),
    ]),
    expected: expect('K6', 'high', 'certain', [4]),
  };

  // Billing is unavailable on this device. Retrying cannot change that.
  rules['K7-retrying-unavailable'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 3, responseCode: 3 }),
      app('query_products', at(S, 22 * SEC), { requested: 3, responseCode: 3 }),
      app('query_products', at(S, 42 * SEC), { requested: 3, returned: 3, responseCode: 0, durationMs: 220 }),
    ]),
    expected: expect('K7', 'low', 'certain', [3, 4, 5]),
  };

  // The purchase flow was launched from product details fetched hours earlier.
  rules['K8-stale-product-details'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 2, returned: 2, durationMs: 240 }),
      app('launch_billing_flow', at(S, 7 * HOUR), { productId: 'basic_monthly', responseCode: 4 }),
    ]),
    expected: expect('K8', 'medium', 'likely', [3, 4]),
  };

  // One purchase delivered to two listeners.
  rules['K9-duplicate-purchase-callback'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      purchase('tok_a1', at(S, SEC)),
      get('tok_a1', at(S, 3 * SEC), { ack: PENDING_ACK, expiry: E }),
      grant('tok_a1', at(S, 4 * SEC), { expiry: E }),
      api('subscriptions.acknowledge', 'tok_a1', at(S, 5 * SEC)),
      ledger('ack', 'tok_a1', at(S, 6 * SEC)),
    ]),
    expected: expect('K9', 'medium', 'likely', [0, 1]),
  };

  // The device completed a purchase the server never heard about.
  rules['K10-purchase-never-reached-server'] = {
    timeline: timeline([
      ...boot(S),
      app('purchase_result', at(S, 30 * SEC), { token: 'tok_a1', productId: 'basic_monthly', purchaseState: 'PURCHASED' }),
      support(at(S, 3 * DAY), 'user has a receipt from Google and no subscription in the app'),
    ]),
    expected: expect('K10', 'high', 'certain', [3]),
  };

  // Two catalogue queries in flight at once; the later arrival wins.
  rules['K11-overlapping-product-queries'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 6, returned: 6, durationMs: 4000 }),
      app('query_products', at(S, 4500), { requested: 2, returned: 2, durationMs: 900 }),
    ]),
    expected: expect('K11', 'medium', 'certain', [3, 4]),
  };

  // The base plan id used as though it were the product id.
  rules['K12-base-plan-used-as-product'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), {
        ack: PENDING_ACK,
        expiry: E,
        extra: {
          lineItems: [
            {
              productId: 'basic_monthly',
              expiryTime: E,
              autoRenewingPlan: true,
              offerDetails: { basePlanId: 'monthly-autorenew' },
            },
          ],
        },
      }),
      grant('tok_a1', at(S, 3 * SEC), { expiry: E, tier: 'monthly-autorenew' }),
      api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
      ledger('ack', 'tok_a1', at(S, 5 * SEC)),
    ]),
    expected: expect('K12', 'medium', 'certain', [1, 2]),
  };

  // The purchase failed and the app told the user it worked.
  rules['K13-failure-reported-as-success'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 1, returned: 1, durationMs: 200 }),
      app('launch_billing_flow', at(S, 20 * SEC), { productId: 'basic_monthly', responseCode: 4 }),
      ledger('client_response', undefined, at(S, 25 * SEC), { result: 'success', note: 'the shop closed and showed the thank-you screen' }),
    ]),
    expected: expect('K13', 'medium', 'certain', [4, 5]),
  };

  // The user said no and the app called it an error.
  rules['K14-cancellation-treated-as-error'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 1, returned: 1, durationMs: 200 }),
      app('launch_billing_flow', at(S, 20 * SEC), { productId: 'basic_monthly', errorMessage: 'purchase cancelled by user' }),
      ledger('client_response', undefined, at(S, 23 * SEC), { result: 'error', note: 'raw purchase payload shown in an alert' }),
    ]),
    expected: expect('K14', 'low', 'likely', [4, 5]),
  };

  return rules;
}
