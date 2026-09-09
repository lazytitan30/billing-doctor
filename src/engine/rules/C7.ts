import { defineRule } from '../rule.js';
import { isLedgerWrite, isRtdn } from '../helpers.js';

// The Console's test notification carries only a version; it is not a purchase.
export const C7 = defineRule({
  id: 'C7',
  group: 'C',
  severity: 'low',
  title: 'Test notification applied as a purchase event',
  detects:
    'A ledger write whose messageId is that of a testNotification. The test message proves delivery and carries nothing to apply.',
  run(tl) {
    const hits = [];
    for (const test of tl.events.filter((e) => isRtdn(e) && e.notification === 'test' && e.messageId)) {
      for (const write of tl.events.filter((e) => isLedgerWrite(e) && e.messageId === test.messageId)) {
        hits.push({
          evidence: [test.i, write.i],
          confidence: 'certain' as const,
          mechanism: `The Console's test notification (#${test.i}) drove ledger ${write.op} #${write.i}. It has no token and no purchase behind it.`,
          nextCheck: `Reverse whatever #${write.i} wrote. Make the handler log and acknowledge a testNotification and return before any lookup.`,
        });
      }
    }
    return hits;
  },
});
