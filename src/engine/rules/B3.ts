import { defineRule } from '../rule.js';
import { isGrant, lastPurchaseState } from '../helpers.js';

// Access granted while the purchase was still PENDING: the user has not paid yet.
export const B3 = defineRule({
  id: 'B3',
  group: 'B',
  severity: 'high',
  title: 'Entitlement granted while the purchase was PENDING',
  detects:
    'A ledger grant whose last known purchase state is PENDING. Google says not to grant until it reports the payment method was charged.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const grant of events.filter(isGrant)) {
        const last = lastPurchaseState(events, grant);
        if (last?.state !== 'PENDING') continue;
        hits.push({
          evidence: [last.event.i, grant.i],
          confidence: 'certain' as const,
          mechanism: `${token} was reported PENDING at event #${last.event.i}; the ledger granted it at event #${grant.i} before any PURCHASED state was seen. A pending purchase can still be cancelled, and then the grant stays.`,
          nextCheck: `Check whether a PURCHASED state ever arrived for ${token} (a notification of type 4 or ONE_TIME_PRODUCT_PURCHASED, or a later purchases.*.get). Gate the grant on getPurchaseState() == PURCHASED or on the API's state.`,
        });
      }
    }
    return hits;
  },
});
