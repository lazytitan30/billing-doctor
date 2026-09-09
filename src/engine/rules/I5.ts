import { defineRule } from '../rule.js';
import { isLedger, isOkGet, isPurchaseResult, precedes } from '../helpers.js';

// Verification succeeded and the ledger never wrote: fulfilment failed silently.
export const I5 = defineRule({
  id: 'I5',
  group: 'I',
  severity: 'high',
  title: 'Verification succeeded and nothing was written',
  detects:
    'A PURCHASED result followed by a successful purchases.*.get for the token, and no ledger event for the token after the purchase. The write after the verify call is where fulfilment lives; a database role that lost its grants fails there silently.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const purchase = events.find((e) => isPurchaseResult(e) && e.purchaseState === 'PURCHASED');
      if (!purchase) continue;
      const read = events.find((e) => isOkGet(e) && precedes(purchase, e));
      if (!read) continue;
      if (events.some((e) => isLedger(e) && precedes(purchase, e))) continue;
      hits.push({
        evidence: [purchase.i, read.i],
        confidence: 'likely' as const,
        mechanism: `${token} was purchased at #${purchase.i} and verified at #${read.i}; no ledger write for it appears afterwards.`,
        nextCheck: `Check the database role the server uses for INSERT and UPDATE grants on the entitlement tables, and that the write's error is not swallowed. Add a boot-time preflight that verifies the grants and shouts in the deploy log.`,
      });
    }
    return hits;
  },
});
