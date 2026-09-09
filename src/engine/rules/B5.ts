import { defineRule } from '../rule.js';
import { isAck, isConsume, isPurchaseResult, productOf, productTypeOf } from '../helpers.js';

// A consumable that was acknowledged instead of consumed cannot be bought again.
export const B5 = defineRule({
  id: 'B5',
  group: 'B',
  severity: 'medium',
  title: 'Consumable acknowledged instead of consumed',
  detects:
    'A token whose product is declared consumable in app.products, with an acknowledgement and no consumption. Only consuming makes the product available for repurchase.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const productId = productOf(tl, token);
      if (productTypeOf(tl, productId) !== 'consumable') continue;
      if (events.some(isConsume)) continue;
      const ack = events.find(isAck);
      if (!ack) continue;
      const purchase = events.find(isPurchaseResult);
      hits.push({
        evidence: purchase ? [purchase.i, ack.i] : [ack.i],
        confidence: 'certain' as const,
        mechanism: `${productId} is a consumable; ${token} was acknowledged at #${ack.i} and never consumed, so the user cannot buy ${productId} again until it is.`,
        nextCheck: `Call purchases.products.consume (or consumeAsync on the device) for consumables in the fulfilment path; check the consumptionState on purchases.productsv2.get for this token.`,
      });
    }
    return hits;
  },
});
