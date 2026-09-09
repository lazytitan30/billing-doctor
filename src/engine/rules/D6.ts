import { defineRule } from '../rule.js';
import { runStateRule } from './stateRules.js';

// Expired: every item is past its expiry; nothing is paid for.
export const D6 = defineRule({
  id: 'D6',
  group: 'D',
  severity: 'high',
  title: 'EXPIRED with the ledger still granting',
  detects:
    'An EXPIRED resource followed by a ledger grant, or left granted with no revoke, or a policy that grants on EXPIRED. When the billing cycle ends, access should be revoked.',
  run(tl) {
    return runStateRule(tl, {
      state: 'SUBSCRIPTION_STATE_EXPIRED',
      access: 'remove',
      short: 'Expired means the paid period ended and did not renew.',
      nextCheck: 'revoke on EXPIRED, and run a reconciliation that compares granted rows with purchases.subscriptionsv2.get.',
    });
  },
});
