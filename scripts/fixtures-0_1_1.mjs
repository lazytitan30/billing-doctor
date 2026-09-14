// Fixtures added in 0.1.1, after the second measurement (2026-09-13: thirty-five
// incidents nobody here wrote, scored with the rules frozen). Two kinds:
//
//   makeFixtures: the four rules the sample's blind spots earned, one minimal
//   timeline each, triggering exactly that rule.
//
//   makeNoise: one timeline per pattern on which a rule spoke about the file
//   rather than the fault. Each is the shape of a real report, reduced. The
//   expected findings are what the tool says now; a fixture that starts
//   saying more is a regression.
//
// Imported by scripts/fixtures.mjs, which owns the builders and the writing.

export function makeFixtures(b) {
  const { timeline, api, ledger, grant, get, purchase, rtdn, support, opening, at, expect } = b;
  const { SEC, MIN, HOUR, DAY, S, E, ACTIVE, PENDING_ACK } = b;
  const rules = {};

  const app = (type, t, o = {}) => ({ t, kind: 'app', type, ...o });
  const boot = (start) => [app('app_start', start), app('billing_connected', at(start, 400)), app('query_purchases', at(start, 600))];

  // Verified, granted, notified, written, and never acknowledged by anyone.
  // The file records no refund, but the window closed a day ago.
  rules['B14-never-acknowledged-no-refund-recorded'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
      grant('tok_a1', at(S, 3 * SEC), { expiry: E }),
      rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      get('tok_a1', at(S, 10 * SEC), { ack: PENDING_ACK, expiry: E }),
      ledger('write', 'tok_a1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE }),
      support(at(S, 4 * DAY), 'the user says Google refunded them; nothing in our logs shows why'),
    ]),
    expected: expect('B14', 'high', 'likely', [0]),
  };

  // Six months to a year is cheaper per month, so the prorated-charge mode is
  // refused, twice, with the error Play gives for it.
  rules['F8-prorated-charge-for-cheaper-plan'] = {
    timeline: timeline(
      [
        ...opening('tok_a1', S, { productId: 'six_month' }),
        app('launch_billing_flow', at(S, 10 * DAY), { productId: 'yearly', oldToken: 'tok_a1', replacementMode: 'CHARGE_PRORATED_PRICE', obfuscatedAccountId: 'hm_1', responseCode: 2, errorMessage: 'Error while retrieving information from server [DF-DFERH-01]' }),
        app('launch_billing_flow', at(S, 10 * DAY + MIN), { productId: 'yearly', oldToken: 'tok_a1', replacementMode: 'CHARGE_PRORATED_PRICE', obfuscatedAccountId: 'hm_1', responseCode: 2, errorMessage: 'Error while retrieving information from server [DF-DFERH-01]' }),
        support(at(S, 10 * DAY + HOUR), 'monthly to yearly and monthly to six-month work; only six-month to yearly fails'),
      ],
      { app: { products: { basic_monthly: 'subscription', six_month: 'subscription', yearly: 'subscription' } } },
    ),
    expected: expect('F8', 'medium', 'likely', [8, 9]),
  };

  // The release moved the app to library 8; the restore query returns nothing
  // for anyone who reinstalled, because consumed purchases are not active ones.
  rules['K16-consumed-purchases-gone-on-library-8'] = {
    timeline: timeline([
      { t: at(S, -2 * DAY), kind: 'console', note: 'release built against Billing Library 8 rolled out to production', billingLibrary: '8.0.0', release: 'published' },
      app('app_start', S),
      app('billing_connected', at(S, 400)),
      app('query_purchases', at(S, 900), { returned: 0, responseCode: 0 }),
      support(at(S, 2 * DAY), 'restore finds nothing for anyone who reinstalled; the same users restored fine before the update'),
    ]),
    expected: expect('K16', 'medium', 'possible', [0, 3]),
  };

  // The catalogue answers, the purchase flow is refused: the product is not
  // available to this user, for one of the reasons Google lists.
  rules['K17-item-unavailable-at-purchase'] = {
    timeline: timeline([
      ...boot(S),
      app('query_products', at(S, 2 * SEC), { requested: 1, returned: 1, responseCode: 0 }),
      app('launch_billing_flow', at(S, MIN), { productId: 'basic_monthly', responseCode: 4, errorMessage: 'ITEM_UNAVAILABLE' }),
      support(at(S, HOUR), 'the product was created in the Console this morning; the flow is refused for every tester'),
    ]),
    expected: expect('K17', 'high', 'certain', [4]),
  };

  return rules;
}

export function makeNoise(b) {
  const { timeline, api, ledger, get, purchase, rtdn, support, at } = b;
  const { SEC, MIN, HOUR, DAY, S, E, PENDING_ACK } = b;
  const noise = {};

  const app = (type, t, o = {}) => ({ t, kind: 'app', type, ...o });
  const finding = (ruleId, severity, confidence, evidence) => ({ ruleId, severity, confidence, evidence });
  const expectAll = (...findings) => ({ findings });

  // Three attempts that all failed with BILLING_UNAVAILABLE. Not three
  // clients: nothing ever connected. K7 owns the condition, K1 the empty
  // catalogue that followed.
  noise['K9-retry-after-failed-connection'] = {
    timeline: timeline([
      app('app_start', S),
      app('billing_connected', at(S, 400), { responseCode: 3, errorMessage: 'Billing is unavailable. This may be a problem with your device, or the Play Store may be down.' }),
      app('query_purchases', at(S, 600)),
      app('billing_connected', at(S, 30 * SEC), { responseCode: 3, errorMessage: 'Billing is unavailable. This may be a problem with your device, or the Play Store may be down.' }),
      app('billing_connected', at(S, MIN), { responseCode: 3, errorMessage: 'Billing is unavailable. This may be a problem with your device, or the Play Store may be down.' }),
      app('query_products', at(S, MIN + 2 * SEC), { requested: 2, returned: 0, responseCode: 3 }),
      support(at(S, DAY), 'forty-five users hit this yesterday; most purchases still go through for everyone else'),
    ]),
    expected: expectAll(finding('K1', 'high', 'certain', [5]), finding('K7', 'low', 'certain', [1, 3, 4])),
  };

  // A relaunch is a new process with a client of its own, not a second
  // client. The purchase the listener never delivered turns up in the next
  // session's query, which is K10's fact reached by another road; with nothing
  // from the server in the file, K10 says what the file can show, once.
  noise['K9-new-process-is-not-a-second-client'] = {
    timeline: timeline([
      app('app_start', S),
      app('billing_connected', at(S, 400)),
      app('query_purchases', at(S, 600)),
      app('launch_billing_flow', at(S, 30 * SEC), { productId: 'basic_monthly', note: 'Play confirmed the purchase; no purchase update ever arrived' }),
      app('app_start', at(S, HOUR)),
      app('billing_connected', at(S, HOUR + 400)),
      app('query_purchases', at(S, HOUR + 900), { returned: 1, token: 'tok_a1', productId: 'basic_monthly', purchaseState: 'PURCHASED' }),
      support(at(S, 2 * HOUR), 'the purchase stream never fired; on relaunch the subscription is there, unacknowledged'),
    ]),
    expected: expectAll(finding('K10', 'medium', 'possible', [6])),
  };

  // The only connection in the file belongs to a later session. It says
  // nothing about the calls made two days earlier, and the file has nothing
  // from the server, so K10 and B12 each say so once.
  noise['K2-connection-in-a-later-session'] = {
    timeline: timeline([
      app('launch_billing_flow', S, { productId: 'pack_deluxe' }),
      app('purchase_result', at(S, 20 * SEC), { token: 'tok_a1', productId: 'pack_deluxe', purchaseState: 'PURCHASED' }),
      app('acknowledge', at(S, 21 * SEC), { token: 'tok_a1' }),
      support(at(S, 2 * DAY), 'refunded and revoked the order in the Console; restore still grants it'),
      app('app_start', at(S, 2 * DAY + HOUR)),
      app('billing_connected', at(S, 2 * DAY + HOUR + 400)),
      app('query_purchases', at(S, 2 * DAY + HOUR + 900), { returned: 1, token: 'tok_a1' }),
    ]),
    expected: expectAll(finding('K10', 'medium', 'possible', [1]), finding('B12', 'medium', 'possible', [2])),
  };

  // The same rule still fires inside a session: the first query ran before
  // the connection it needed.
  noise['K2-first-call-before-connection-in-the-same-session'] = {
    timeline: timeline([
      app('app_start', S),
      app('query_purchases', at(S, 300)),
      app('billing_connected', at(S, 900)),
      app('query_products', at(S, 2 * SEC), { requested: 3, returned: 3, responseCode: 0 }),
    ]),
    expected: expectAll(finding('K2', 'medium', 'likely', [1, 2])),
  };

  // Three refused reads of a one-time purchase. Nothing here was sold; the
  // API answered 401, which is A2's.
  noise['A7-api-read-is-not-a-sale'] = {
    timeline: timeline(
      [
        api('products.get', 'tok_a1', S, { status: 401, extra: { productId: 'pack_deluxe', note: 'permissionDenied: The current user has insufficient permissions' } }),
        api('products.get', 'tok_a1', at(S, HOUR), { status: 401, extra: { productId: 'pack_deluxe' } }),
        api('products.get', 'tok_a1', at(S, DAY), { status: 401, extra: { productId: 'pack_deluxe' } }),
        support(at(S, DAY + HOUR), 'the same credentials list in-app products fine; only purchase checks are refused'),
      ],
      { config: { serviceAccountRoles: ['View financial data', 'Manage orders and subscriptions'] } },
    ),
    expected: expectAll(finding('A2', 'high', 'certain', [0])),
  };

  // Verified, acknowledged, confirmed, and not one ledger row in the file.
  // Either the backend wrote nothing or its ledger was left out, and the file
  // cannot tell which, so the finding stands at lower confidence rather than
  // at full strength or not at all: the incident I5 was written from had no
  // ledger row either, because the writes were what failed.
  noise['I5-no-ledger-in-the-file'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
      api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
      rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      get('tok_a1', at(S, 10 * SEC), { expiry: E }),
      support(at(S, DAY), 'user paid and nothing unlocked'),
    ]),
    expected: expectAll(finding('I5', 'high', 'possible', [0, 1])),
  };

  // The verify endpoint answered success and wrote nothing; the reply is not
  // a row. The device acknowledgement nothing confirmed is B12's.
  noise['I5-client-response-is-not-a-write'] = {
    timeline: timeline([
      app('purchase_result', S, { token: 'tok_a1', productId: 'basic_monthly', purchaseState: 'PURCHASED' }),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
      ledger('client_response', 'tok_a1', at(S, 3 * SEC), { result: 'success' }),
      app('acknowledge', at(S, 4 * SEC), { token: 'tok_a1' }),
      support(at(S, MIN), 'owned stays false after the whole cycle; the store says the subscription is active'),
    ]),
    expected: expectAll(finding('I5', 'high', 'likely', [0, 1, 2]), finding('B12', 'high', 'likely', [3])),
  };

  // Two people bought the same non-consumable two hours apart. The second
  // flow is a second buyer, not a re-purchase; and nobody acknowledged either
  // purchase, which is why both were refunded three days later.
  noise['K4-two-buyers-of-one-product'] = {
    timeline: timeline([
      app('launch_billing_flow', S, { productId: 'pack_deluxe', appAccount: 'u_1' }),
      app('purchase_result', at(S, 20 * SEC), { token: 'tok_a1', productId: 'pack_deluxe', purchaseState: 'PURCHASED', appAccount: 'u_1' }),
      app('launch_billing_flow', at(S, 2 * HOUR), { productId: 'pack_deluxe', appAccount: 'u_2' }),
      app('purchase_result', at(S, 2 * HOUR + 20 * SEC), { token: 'tok_b2', productId: 'pack_deluxe', purchaseState: 'PURCHASED', appAccount: 'u_2' }),
      support(at(S, 3 * DAY + 3 * HOUR), 'both orders show as refunded in the Console; nobody asked for a refund'),
    ]),
    expected: expectAll(finding('B14', 'high', 'possible', [1]), finding('B14', 'high', 'possible', [3]), finding('K10', 'medium', 'possible', [1, 3])),
  };

  // Three purchases acknowledged on the device and nothing from the server in
  // the file. That is one fact, said once by each rule that rests on it, not
  // three findings per token.
  noise['H4-K10-B12-one-finding-each-without-server-events'] = {
    timeline: timeline([
      app('app_start', S),
      app('purchase_result', at(S, MIN), { token: 'tok_a1', productId: 'basic_monthly', purchaseState: 'PURCHASED' }),
      app('acknowledge', at(S, MIN + SEC), { token: 'tok_a1' }),
      app('purchase_result', at(S, DAY), { token: 'tok_b2', productId: 'basic_monthly', purchaseState: 'PURCHASED' }),
      app('acknowledge', at(S, DAY + SEC), { token: 'tok_b2' }),
      app('purchase_result', at(S, 2 * DAY), { token: 'tok_c3', productId: 'basic_monthly', purchaseState: 'PURCHASED' }),
      app('acknowledge', at(S, 2 * DAY + SEC), { token: 'tok_c3' }),
      support(at(S, 5 * DAY), 'refunds never show up anywhere; we only find out when the user complains'),
    ]),
    expected: expectAll(finding('H4', 'medium', 'likely', [0]), finding('K10', 'medium', 'possible', [1, 3, 5]), finding('B12', 'medium', 'possible', [2, 4, 6])),
  };

  // The listener never fired; the device query on the next launch returned the
  // purchase as PURCHASED. The backend is in the file (it looked another token
  // up) and has nothing for this one: the same certainty as a listener result.
  noise['K10-purchase-first-seen-in-query'] = {
    timeline: timeline([
      app('app_start', S),
      app('billing_connected', at(S, 400)),
      app('query_purchases', at(S, 900), { returned: 1, token: 'tok_a1', productId: 'basic_monthly', purchaseState: 'PURCHASED' }),
      ledger('lookup', 'tok_b2', at(S, HOUR), { lookup: 'token', matchedUsers: 1 }),
      support(at(S, DAY), 'the user has a receipt from Google and no subscription in the app'),
    ]),
    expected: expectAll(finding('K10', 'high', 'certain', [2])),
  };

  return noise;
}
