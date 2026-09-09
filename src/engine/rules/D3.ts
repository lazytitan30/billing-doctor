import { defineRule } from '../rule.js';
import { runStateRule } from './stateRules.js';

// During a grace period the user keeps access while Google retries payment.
export const D3 = defineRule({
  id: 'D3',
  group: 'D',
  severity: 'high',
  title: 'IN_GRACE_PERIOD treated as no access',
  detects:
    'An IN_GRACE_PERIOD resource followed by a ledger revoke, or a policy that revokes on grace period. Google says the user keeps access while the payment is retried.',
  run(tl) {
    return runStateRule(tl, {
      state: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      access: 'keep',
      short: 'Grace period is Google retrying a failed payment with access kept; expiryTime is extended while it lasts.',
      nextCheck: 'keep access on IN_GRACE_PERIOD and store the extended expiryTime; remove access only on ON_HOLD.',
    });
  },
});
