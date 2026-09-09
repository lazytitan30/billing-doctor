// Rule fixtures for groups A, H, I and J. Imported by scripts/fixtures.mjs,
// which owns the builders and the writing; this file only describes timelines.

export function makeFixtures(b) {
  const { timeline, purchase, get, api, ledger, grant, rtdn, support, opening, at, expect } = b;
  const { SEC, MIN, DAY, S, E, ACTIVE, PAUSED, PENDING_ACK } = b;
  const rules = {};

  // ---- A. Configuration and permissions ----

  const short = (token, start, user) => [
    purchase(token, start, { accountId: `hm_${user}` }),
    get(token, at(start, 2 * SEC), { ack: PENDING_ACK, expiry: at(start, 30 * DAY), accountId: `hm_${user}` }),
    grant(token, at(start, 3 * SEC), { userId: user, expiry: at(start, 30 * DAY) }),
    api('subscriptions.acknowledge', token, at(start, 4 * SEC)),
    ledger('ack', token, at(start, 5 * SEC)),
  ];
  rules['A1-no-notifications'] = {
    timeline: timeline([
      ...short('tok_a1', S, 'u_1'),
      ...short('tok_b2', at(S, 2 * DAY), 'u_2'),
      support(at(S, 3 * DAY), 'renewals stopped arriving; the endpoint log is empty since the topic was recreated'),
    ]),
    expected: expect('A1', 'high', 'likely', [0, 5]),
  };

  rules['A2-api-forbidden'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { status: 403, extra: { subscriptionState: undefined, acknowledgementState: undefined, externalAccountIdentifiers: undefined } }),
      ledger('client_response', 'tok_a1', at(S, 3 * SEC), { result: 'error' }),
    ]),
    expected: expect('A2', 'high', 'certain', [1]),
  };

  rules['A3-topic-in-other-project'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1' })], {
      config: { project: 'my-app-project', rtdn: { topicProject: 'my-other-project', pushEndpointAuth: 'oidc' } },
    }),
    expected: expect('A3', 'info', 'certain', []),
  };

  rules['A4-negative-ack-redelivered'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(2, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E, status: 500 }),
      rtdn(2, 'tok_a1', at(E, 10 * MIN), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 10 * MIN + SEC), { expiry: at(E, 31 * DAY) }),
      ledger('expiry', 'tok_a1', at(E, 10 * MIN + 2 * SEC), { messageId: 'm-2', expiry: at(E, 31 * DAY), expirySource: 'expiryTime' }),
    ]),
    expected: expect('A4', 'medium', 'certain', [8, 9]),
  };

  rules['A5-unauthenticated-endpoint'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1' })], {
      policy: { refetchOnEveryNotification: false },
      config: { rtdn: { pushEndpointAuth: 'none' } },
    }),
    expected: expect('A5', 'medium', 'certain', []),
  };

  rules['A6-library-below-8-after-gate'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      { t: at(S, 13 * DAY), kind: 'console', note: 'new release created', release: 'created', billingLibrary: '7.1.1' },
    ]),
    expected: expect('A6', 'high', 'certain', [8]),
  };

  // ---- H. Account binding and restore ----

  rules['H1-unmappable-notification'] = {
    timeline: timeline([
      rtdn(2, 'tok_z9', S, { messageId: 'm-1' }),
      get('tok_z9', at(S, SEC), { expiry: at(S, 30 * DAY), extra: { externalAccountIdentifiers: null } }),
      ledger('lookup', 'tok_z9', at(S, 2 * SEC), { lookup: 'token', matchedUsers: 0 }),
    ]),
    expected: expect('H1', 'high', 'certain', [1, 2]),
  };

  rules['H2-raw-account-id'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1', accountId: 'u_1' })]),
    expected: expect('H2', 'medium', 'certain', [0, 2]),
  };

  rules['H3-find-one-many-users'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(2, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { expiry: at(E, 31 * DAY) }),
      ledger('lookup', 'tok_a1', at(E, 7 * SEC), { lookup: 'findOne', matchedUsers: 2 }),
      ledger('expiry', 'tok_a1', at(E, 8 * SEC), { messageId: 'm-2', expiry: at(E, 31 * DAY), expirySource: 'expiryTime' }),
    ]),
    expected: expect('H3', 'medium', 'certain', [10]),
  };

  rules['H4-no-query-purchases'] = {
    timeline: timeline([
      { t: at(S, -10 * SEC), kind: 'app', type: 'app_start' },
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
    ]),
    expected: expect('H4', 'medium', 'likely', [0]),
  };

  rules['H5-suspended-not-included'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(10, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { state: PAUSED, expiry: E, extra: { pausedStateContext: { autoResumeTime: at(E, 31 * DAY) } } }),
      ledger('revoke', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: PAUSED }),
      { t: at(E, DAY), kind: 'app', type: 'app_resume' },
      { t: at(E, DAY + 2 * SEC), kind: 'app', type: 'query_purchases', includeSuspendedSubscriptions: false },
    ]),
    expected: expect('H5', 'low', 'certain', [9, 12]),
  };

  rules['H6-different-google-account'] = {
    timeline: timeline([
      { ...purchase('tok_a1', S), googleAccount: 'g_2', appAccount: 'u_1' },
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }).slice(1),
    ]),
    expected: expect('H6', 'info', 'certain', [0]),
  };

  // ---- I. Testing and Console ----

  const testRead = (token, t, expiry) => get(token, t, { expiry, extra: { testPurchase: true } });
  rules['I1-test-renewals-minutes-apart'] = {
    timeline: timeline([
      purchase('tok_t1', S),
      get('tok_t1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: at(S, 5 * MIN), extra: { testPurchase: true } }),
      grant('tok_t1', at(S, 3 * SEC), { expiry: at(S, 5 * MIN), extra: { test: true } }),
      api('subscriptions.acknowledge', 'tok_t1', at(S, 4 * SEC)),
      ledger('ack', 'tok_t1', at(S, 5 * SEC), { test: true }),
      rtdn(4, 'tok_t1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      testRead('tok_t1', at(S, 10 * SEC), at(S, 5 * MIN)),
      ledger('write', 'tok_t1', at(S, 11 * SEC), { messageId: 'm-1', fromState: ACTIVE, test: true }),
      rtdn(2, 'tok_t1', at(S, 5 * MIN + 3 * SEC), { messageId: 'm-2', eventTime: at(S, 5 * MIN) }),
      testRead('tok_t1', at(S, 5 * MIN + 4 * SEC), at(S, 10 * MIN)),
      ledger('expiry', 'tok_t1', at(S, 5 * MIN + 5 * SEC), { messageId: 'm-2', expiry: at(S, 10 * MIN), expirySource: 'expiryTime', test: true }),
      rtdn(2, 'tok_t1', at(S, 10 * MIN + 3 * SEC), { messageId: 'm-3', eventTime: at(S, 10 * MIN) }),
      testRead('tok_t1', at(S, 10 * MIN + 4 * SEC), at(S, 15 * MIN)),
      ledger('expiry', 'tok_t1', at(S, 10 * MIN + 5 * SEC), { messageId: 'm-3', expiry: at(S, 15 * MIN), expirySource: 'expiryTime', test: true }),
    ]),
    expected: expect('I1', 'info', 'certain', [8, 11]),
  };

  rules['I2-test-rows-in-production'] = {
    timeline: timeline([
      purchase('tok_t1', S),
      get('tok_t1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: at(S, 5 * MIN), extra: { testPurchase: true } }),
      grant('tok_t1', at(S, 3 * SEC), { expiry: at(S, 5 * MIN) }),
      api('subscriptions.acknowledge', 'tok_t1', at(S, 4 * SEC)),
      ledger('ack', 'tok_t1', at(S, 5 * SEC)),
    ]),
    expected: expect('I2', 'medium', 'certain', [1, 2]),
  };

  rules['I3-approved-not-published'] = {
    timeline: timeline(
      [
        ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
        { t: at(S, 4 * DAY), kind: 'console', note: 'release 1.8.0 approved', release: 'approved' },
        support(at(S, 7 * DAY), 'users say the fix is not in the store version'),
      ],
      { config: { rtdn: { pushEndpointAuth: 'oidc' }, console: { managedPublishing: true } } },
    ),
    expected: expect('I3', 'info', 'certain', [8]),
  };

  rules['I4-closed-test-short'] = {
    timeline: timeline(
      [
        ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
        { t: at(S, DAY), kind: 'console', note: 'production access application', closedTest: { testers: 9, days: 10 } },
      ],
      { config: { rtdn: { pushEndpointAuth: 'oidc' }, console: { accountType: 'personal', accountCreated: '2024-03-01' } } },
    ),
    expected: expect('I4', 'info', 'certain', [8]),
  };

  rules['I5-verified-nothing-written'] = {
    timeline: timeline([
      purchase('tok_a1', S),
      get('tok_a1', at(S, 2 * SEC), { ack: PENDING_ACK, expiry: E }),
      api('subscriptions.acknowledge', 'tok_a1', at(S, 4 * SEC)),
      rtdn(4, 'tok_a1', at(S, 9 * SEC), { messageId: 'm-1', eventTime: S }),
      get('tok_a1', at(S, 10 * SEC), { expiry: E }),
      support(at(S, DAY), 'user paid and nothing unlocked'),
    ]),
    expected: expect('I5', 'high', 'likely', [0, 1]),
  };

  // ---- J. Ledger integrity, retention, redaction ----

  rules['J1-grant-without-key'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1', grantExtra: { idempotencyKey: undefined } })]),
    expected: expect('J1', 'medium', 'certain', [2]),
  };

  rules['J2-token-kept-after-expiry'] = {
    timeline: timeline([
      ...opening('tok_a1', S, { expiry: E, messageId: 'm-1' }),
      rtdn(13, 'tok_a1', at(E, 5 * SEC), { messageId: 'm-2', eventTime: E }),
      get('tok_a1', at(E, 6 * SEC), { state: 'SUBSCRIPTION_STATE_EXPIRED', expiry: E }),
      ledger('revoke', 'tok_a1', at(E, 7 * SEC), { messageId: 'm-2', fromState: 'SUBSCRIPTION_STATE_EXPIRED' }),
      support(at(E, 100 * DAY), 'data audit: raw purchase tokens and payloads still in the ledger'),
    ]),
    expected: expect('J2', 'low', 'likely', [8]),
  };

  const real = 'kjhgfdsa.AO-J1OyExampleRealLookingTokenValue0123456789abcdefghijklmnop';
  rules['J3-real-token-in-timeline'] = {
    timeline: timeline([
      ...opening(real, S, { expiry: E, messageId: 'm-1' }),
      support(at(S, DAY), 'ticket from someone@example.com: access disappeared'),
    ]),
    expected: expect('J3', 'medium', 'certain', [0, 1, 2, 3, 4]),
  };

  rules['J4-local-time-expiry'] = {
    timeline: timeline([...opening('tok_a1', S, { expiry: E, messageId: 'm-1', grantExtra: { expiry: '2026-10-01T10:00:00', expirySource: 'expiryTime' } })]),
    expected: expect('J4', 'medium', 'certain', [2]),
  };

  return rules;
}
