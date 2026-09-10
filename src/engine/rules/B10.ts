import { defineRule } from '../rule.js';
import { isApi, isGrant, isPurchaseResult, precedes } from '../helpers.js';

// The schema is deliberately loose, so a number is only a number once it says so.
function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

// Ten bought, one granted.
export const B10 = defineRule({
  id: 'B10',
  group: 'B',
  severity: 'high',
  title: 'Multi-quantity purchase granted as a single unit',
  detects:
    'A purchase whose quantity is more than one, followed by a grant that recorded fewer units than were bought. Entitlement has to follow the purchased quantity, and a grant recording no quantity at all is left alone because it is not evidence either way.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const bought = events.find((e) => (isPurchaseResult(e) || isApi(e)) && (num(e.quantity) ?? 0) > 1);
      if (!bought) continue;
      const quantity = num(bought.quantity) ?? 0;
      const grant = events.find((e) => isGrant(e) && precedes(bought, e));
      if (!grant) continue;
      const granted = num(grant.quantityGranted);
      if (granted === undefined || granted >= quantity) continue;
      hits.push({
        evidence: [bought.i, grant.i],
        confidence: 'certain' as const,
        mechanism: `${token} was bought with quantity ${quantity} at #${bought.i}; the grant at #${grant.i} recorded ${granted}. The user paid for ${quantity} and holds ${granted}.`,
        nextCheck: `Read the quantity from the purchase, on the device or from the quantity field on the Developer API resource, and grant that many units before consuming the token once. Then check whether a partial refund can take some of them back: refundableQuantity on the resource says how many remain.`,
      });
    }
    return hits;
  },
});
