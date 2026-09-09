import { defineRule } from '../rule.js';
import { isAck, lastPurchaseState } from '../helpers.js';

// An acknowledgement sent while the last reported purchase state was PENDING.
export const B2 = defineRule({
  id: 'B2',
  group: 'B',
  severity: 'medium',
  title: 'Acknowledged while the purchase was still PENDING',
  detects:
    'An acknowledgement whose last known purchase state, from the device or the API, is PENDING. The three-day window has not started yet and Google says not to acknowledge until PURCHASED.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const ack of events.filter(isAck)) {
        const last = lastPurchaseState(events, ack);
        if (last?.state !== 'PENDING') continue;
        hits.push({
          evidence: [last.event.i, ack.i],
          confidence: 'certain' as const,
          mechanism: `${token} was reported PENDING at event #${last.event.i} and acknowledged at event #${ack.i} before any PURCHASED state was seen.`,
          nextCheck: `Confirm the purchase state on the device or with purchases.productsv2.get at the time of the acknowledgement. Acknowledge only after the state reads PURCHASED, which arrives as a notification or on the next queryPurchasesAsync().`,
        });
      }
    }
    return hits;
  },
});
