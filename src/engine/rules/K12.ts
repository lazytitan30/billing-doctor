import { defineRule } from '../rule.js';
import { isApp, isLedger, isOkGet } from '../helpers.js';

// The base plan id is not the product id. Some wrappers hand back the base plan
// as the identifier, and a catalogue keyed on it finds nothing.
export const K12 = defineRule({
  id: 'K12',
  group: 'K',
  severity: 'medium',
  title: 'Base plan id used where the product id belongs',
  detects:
    'A device or ledger event naming a base plan id from the subscription resource as if it were the product id, while the resource gives a different product id for that line item.',
  run(tl) {
    // Every base plan seen, and the product it belongs to.
    const planToProduct = new Map<string, { productId: string; at: number }>();
    for (const e of tl.events) {
      if (!isOkGet(e)) continue;
      for (const item of e.lineItems ?? []) {
        const plan = item.offerDetails?.basePlanId;
        if (plan && item.productId && plan !== item.productId) planToProduct.set(plan, { productId: item.productId, at: e.i });
      }
    }
    if (planToProduct.size === 0) return [];
    const hits = [];
    const reported = new Set<string>();
    for (const e of tl.events) {
      const named = isApp(e) ? e.productId : isLedger(e) ? e.tier : undefined;
      if (!named) continue;
      const match = planToProduct.get(named);
      if (!match || reported.has(named)) continue;
      reported.add(named);
      hits.push({
        evidence: [match.at, e.i],
        confidence: 'certain' as const,
        mechanism: `The resource at #${match.at} names ${named} as the base plan of the product ${match.productId}. Event #${e.i} uses ${named} as though it were the product.`,
        nextCheck: `Key the catalogue and the entitlement on the product id from lineItems[].productId, and keep the base plan id only for choosing an offer. Some wrappers return the base plan as the identifier and the product id in a second field: map it back before anything else reads it.`,
      });
    }
    return hits;
  },
});
