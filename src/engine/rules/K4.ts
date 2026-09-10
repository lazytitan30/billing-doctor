import { defineRule } from '../rule.js';
import { isApp, isConsume, isPurchaseResult, isRevoke, precedes, tokenEvents } from '../helpers.js';

// Offering a product the user already holds. Google says not to.
export const K4 = defineRule({
  id: 'K4',
  group: 'K',
  severity: 'medium',
  title: 'Purchase flow launched for a product the user already owns',
  detects:
    'A launch_billing_flow for a product the device already reported as PURCHASED, where that purchase was never consumed or revoked. The flow can only fail as already owned.',
  run(tl) {
    const hits = [];
    for (const flow of tl.events) {
      if (!isApp(flow) || flow.type !== 'launch_billing_flow' || !flow.productId) continue;
      // A replacement deliberately buys a different plan against an old token.
      if (flow.replacementMode || flow.oldToken) continue;
      const owned = tl.events.find((p) => {
        if (!isPurchaseResult(p) || p.productId !== flow.productId || p.purchaseState !== 'PURCHASED') return false;
        if (!precedes(p, flow)) return false;
        const after = p.token ? tokenEvents(tl, p.token) : [];
        return !after.some((e) => (isConsume(e) || isRevoke(e)) && precedes(e, flow));
      });
      if (!owned) continue;
      hits.push({
        evidence: [owned.i, flow.i],
        confidence: 'certain' as const,
        mechanism: `${flow.productId} was already purchased at #${owned.i} and never consumed or revoked, and the purchase flow was launched for it again at #${flow.i}.`,
        nextCheck: `Hide or relabel a product the user owns: check the result of queryPurchasesAsync before building the shop. If it is a consumable, the real fix is to consume it after granting, which is what makes it buyable again.`,
      });
    }
    return hits;
  },
});
