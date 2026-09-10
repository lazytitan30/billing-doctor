import { defineRule } from '../rule.js';
import { isApi, isLedger, isPurchaseResult, iso } from '../helpers.js';

// The user paid and the backend never heard about it. The worst finding in the
// catalogue, because nothing in the backend can notice it on its own.
export const K10 = defineRule({
  id: 'K10',
  group: 'K',
  severity: 'high',
  title: 'A purchase the device completed that never reached the server',
  detects:
    'A PURCHASED result on the device whose token appears in no API call and no ledger write anywhere in the timeline. The money moved and the backend has no record of it at all.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const purchase = events.find((e) => isPurchaseResult(e) && e.purchaseState === 'PURCHASED');
      if (!purchase) continue;
      if (events.some((e) => isApi(e) || isLedger(e))) continue;
      hits.push({
        evidence: [purchase.i],
        confidence: 'certain' as const,
        mechanism: `${token} was purchased on the device at ${iso(purchase.tMs)} (#${purchase.i}). No call to Google and no ledger write mentions it anywhere in this timeline, so the backend never saw the purchase.`,
        nextCheck: `Verify this token now and grant what the user paid for. Then close the hole: call queryPurchasesAsync on every connection and on resume and send everything it returns through the verify endpoint, and run a reconciliation that compares Google's view against your ledger so the next one is found by a job rather than by the customer.`,
      });
    }
    return hits;
  },
});
