import { defineRule } from '../rule.js';
import { runStateRule } from './stateRules.js';

// Account hold: the grace period ended without payment; access is removed.
export const D4 = defineRule({
  id: 'D4',
  group: 'D',
  severity: 'high',
  title: 'ON_HOLD treated as access',
  detects:
    'An ON_HOLD resource followed by a ledger grant, or left granted with no revoke, or a policy that grants on ON_HOLD. Google says to block access during account hold.',
  run(tl) {
    return runStateRule(tl, {
      state: 'SUBSCRIPTION_STATE_ON_HOLD',
      access: 'remove',
      short: 'On hold means the payment failed for the whole grace period; the user is not paying.',
      nextCheck: 'revoke on ON_HOLD and re-grant on SUBSCRIPTION_RECOVERED after a fresh fetch reads ACTIVE.',
    });
  },
});
