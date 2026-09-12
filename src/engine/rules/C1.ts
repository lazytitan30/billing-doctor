import { defineRule } from '../rule.js';
import { isLedgerWrite, isRtdn } from '../helpers.js';

// One Pub/Sub messageId, two ledger writes: the same notification applied twice.
export const C1 = defineRule({
  id: 'C1',
  group: 'C',
  severity: 'high',
  title: 'Same notification applied twice',
  detects:
    'Two or more ledger writes that carry the same Pub/Sub messageId. Pub/Sub delivers at least once; a handler without a messageId check applies a redelivery as a new event.',
  run(tl) {
    const writesById = new Map<string, number[]>();
    for (const e of tl.events) {
      if (!isLedgerWrite(e) || !e.messageId) continue;
      // push, rather than copy the array each time. Rebuilding it was
      // quadratic when many writes share one messageId, which is exactly what
      // a redelivery storm looks like.
      const seen = writesById.get(e.messageId);
      if (seen) seen.push(e.i);
      else writesById.set(e.messageId, [e.i]);
    }
    const hits = [];
    for (const [messageId, writes] of writesById) {
      if (writes.length < 2) continue;
      const deliveries = tl.events.filter((e) => isRtdn(e) && e.messageId === messageId).map((e) => e.i);
      hits.push({
        evidence: [...deliveries, ...writes].sort((a, b) => a - b),
        confidence: 'certain' as const,
        mechanism: `Notification ${messageId} was delivered ${deliveries.length} time${deliveries.length === 1 ? '' : 's'} and the ledger wrote for it ${writes.length} times (events #${writes.join(', #')}).`,
        nextCheck: `Claim the messageId in a ledger table with a unique constraint before processing; on a conflict, answer 200 and do nothing. Check what the second write changed (credit, expiry, tier) and reverse it by hand.`,
      });
    }
    return hits;
  },
});
