import { defineRule } from '../rule.js';
import { runStateRule } from './stateRules.js';

// Canceled means auto-renew is off; access continues until expiryTime.
export const D2 = defineRule({
  id: 'D2',
  group: 'D',
  severity: 'high',
  title: 'CANCELED treated as no access before expiryTime',
  detects:
    'A CANCELED resource followed by a ledger revoke before its expiryTime, or a policy that revokes on CANCELED. Google says the user keeps access until the end of the paid period.',
  run(tl) {
    return runStateRule(tl, {
      state: 'SUBSCRIPTION_STATE_CANCELED',
      access: 'keep',
      short: 'Canceled is "canceled but not expired yet": the user paid for the period and keeps it.',
      nextCheck: 'grant on CANCELED while expiryTime is in the future, and revoke on EXPIRED (notification 13 confirmed by a fetch).',
    });
  },
});
