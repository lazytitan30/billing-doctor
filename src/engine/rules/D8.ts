import { defineRule } from '../rule.js';
import { isApi } from '../helpers.js';

// The v1 purchases.subscriptions resource is deprecated; v2 is the current one.
export const D8 = defineRule({
  id: 'D8',
  group: 'D',
  severity: 'low',
  title: 'State read through the deprecated v1 purchases.subscriptions.get',
  detects:
    'A call to purchases.subscriptions.get. Google marks the v1 resource deprecated in favour of SubscriptionPurchaseV2, which carries the line items, the linked token and the states the other rules read.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const call = events.find((e) => isApi(e) && e.call === 'subscriptions.get');
      if (!call) continue;
      hits.push({
        evidence: [call.i],
        confidence: 'certain' as const,
        mechanism: `${token} was read through purchases.subscriptions.get at #${call.i}, the deprecated v1 resource.`,
        nextCheck: `Move the read to purchases.subscriptionsv2.get and read subscriptionState, lineItems[].expiryTime and linkedPurchaseToken from it.`,
      });
    }
    return hits;
  },
});
