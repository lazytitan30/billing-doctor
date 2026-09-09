import { defineRule } from '../rule.js';

// Grace period and account hold lengths are Console settings per base plan.
export const E4 = defineRule({
  id: 'E4',
  group: 'E',
  severity: 'info',
  title: 'Grace period or account hold length hard-coded in the backend',
  detects:
    'policy.gracePeriodDays or policy.accountHoldDays present. Both are configured per base plan in the Console and can change; the state and expiryTime on the resource say what is true.',
  run(tl) {
    const grace = tl.policy.gracePeriodDays;
    const hold = tl.policy.accountHoldDays;
    if (grace === undefined && hold === undefined) return [];
    const parts = [];
    if (grace !== undefined) parts.push(`grace period ${grace} days`);
    if (hold !== undefined) parts.push(`account hold ${hold} days`);
    return [
      {
        evidence: [],
        confidence: 'possible' as const,
        mechanism: `The policy hard-codes ${parts.join(' and ')}. Google configures both per base plan in the Console and extends expiryTime during grace, so a clock in the backend drifts from the truth.`,
        nextCheck: `Remove the constants from the access decision; read subscriptionState and lineItems[].expiryTime on every notification instead.`,
      },
    ];
  },
});
