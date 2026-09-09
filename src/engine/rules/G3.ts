import { defineRule } from '../rule.js';
import { isLedger, isPartialVoid, isRevoke, isRtdn, precedes } from '../helpers.js';

// A quantity-based partial refund returns part of a multi-quantity purchase.
export const G3 = defineRule({
  id: 'G3',
  group: 'G',
  severity: 'medium',
  title: 'Partial refund handled as a full revoke',
  detects:
    'A voided-purchase notification with refundType 2 followed by a ledger revoke for the token. A partial void applies to multi-quantity one-time products; refundableQuantity on productsv2 holds the remainder.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const partial of events.filter(isPartialVoid)) {
        const next = events.find((e) => (isLedger(e) || isRtdn(e)) && precedes(partial, e));
        if (!next || !isRevoke(next)) continue;
        hits.push({
          evidence: [partial.i, next.i],
          confidence: 'certain' as const,
          mechanism: `${token} received a quantity-based partial refund at #${partial.i}; the ledger revoked the whole purchase at #${next.i}.`,
          nextCheck: `Fetch purchases.productsv2.get for ${token} and read refundableQuantity and quantity; restore the part the user still owns. Only refundType 1 ends the purchase.`,
        });
      }
    }
    return hits;
  },
});
