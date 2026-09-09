import { defineRule } from '../rule.js';
import { runStateRule } from './stateRules.js';

// Paused: no access until autoResumeTime or a manual resume.
export const D5 = defineRule({
  id: 'D5',
  group: 'D',
  severity: 'high',
  title: 'PAUSED treated as access',
  detects:
    'A PAUSED resource followed by a ledger grant, or left granted with no revoke, or a policy that grants on PAUSED. A paused subscription is not a live entitlement until it resumes.',
  run(tl) {
    return runStateRule(tl, {
      state: 'SUBSCRIPTION_STATE_PAUSED',
      access: 'remove',
      short: 'Paused means the user chose not to pay for a while; pausedStateContext.autoResumeTime says when it comes back.',
      nextCheck: 'revoke on PAUSED and re-grant on SUBSCRIPTION_RECOVERED after a fresh fetch reads ACTIVE.',
    });
  },
});
