import { defineRule } from '../rule.js';
import { isLedger, isPrepaidGet, precedes } from '../helpers.js';

// A prepaid plan recorded as auto-renewing: a renewal is expected and never comes.
export const D10 = defineRule({
  id: 'D10',
  group: 'D',
  severity: 'medium',
  title: 'Prepaid plan treated as auto-renewing',
  detects:
    'A resource with a prepaidPlan line item followed by a ledger write that records the plan as auto-renewing. Prepaid plans do not renew; a top-up, with a new token, extends them.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const read = events.find(isPrepaidGet);
      if (!read) continue;
      const write = events.find((e) => isLedger(e) && e.planType === 'auto-renewing' && precedes(read, e));
      if (!write) continue;
      hits.push({
        evidence: [read.i, write.i],
        confidence: 'certain' as const,
        mechanism: `${token} carries a prepaidPlan (#${read.i}); the ledger recorded it as auto-renewing at #${write.i}, so the backend will wait for a renewal that never comes.`,
        nextCheck: `Store the plan type from lineItems[].prepaidPlan or autoRenewingPlan, treat expiryTime as final for prepaid plans, and handle a top-up as a new purchase token that must be acknowledged.`,
      });
    }
    return hits;
  },
});
