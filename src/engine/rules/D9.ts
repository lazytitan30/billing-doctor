import { defineRule } from '../rule.js';
import { isLedger, isOkGet, precedes } from '../helpers.js';

// A test purchase counted in a metric: revenue, entitlements, subscribers.
export const D9 = defineRule({
  id: 'D9',
  group: 'D',
  severity: 'medium',
  title: 'Test purchase counted in a metric',
  detects:
    'A resource marked testPurchase followed by a ledger count for the token. License-tester purchases are free and renew every few minutes; the marker exists to be excluded.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const read = events.find((e) => isOkGet(e) && e.testPurchase === true);
      if (!read) continue;
      const count = events.find((e) => isLedger(e) && e.op === 'count' && precedes(read, e));
      if (!count) continue;
      hits.push({
        evidence: [read.i, count.i],
        confidence: 'certain' as const,
        mechanism: `${token} is a test purchase (#${read.i}) and was counted in ${count.metric ?? 'a metric'} at #${count.i}.`,
        nextCheck: `Exclude rows whose resource carries testPurchase from every metric; store the flag on the ledger row when it is granted.`,
      });
    }
    return hits;
  },
});
