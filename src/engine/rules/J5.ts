import { defineRule } from '../rule.js';
import { isApi, isLedger, isPurchaseResult, isRtdn } from '../helpers.js';

// The order id is not a key. Promo-code purchases do not have one.
export const J5 = defineRule({
  id: 'J5',
  group: 'J',
  severity: 'medium',
  title: 'Order id used as the key instead of the purchase token',
  detects:
    'A ledger write declared as keyed on the order id, or an idempotency key that is an order id from the timeline. Not every purchase has one, and every renewal brings a new one, so the key is missing for some purchases and different for others.',
  run(tl) {
    const orderIds = new Set<string>();
    for (const e of tl.events) {
      const id = isRtdn(e) || isApi(e) || isPurchaseResult(e) ? (e as { orderId?: string | null }).orderId : undefined;
      if (typeof id === 'string' && id.length > 0) orderIds.add(id);
      if (isApi(e) && typeof e.latestOrderId === 'string') orderIds.add(e.latestOrderId);
    }
    const hits = [];
    for (const e of tl.events) {
      if (!isLedger(e)) continue;
      const byOrder = e.keyedOn === 'orderId';
      const keyIsOrder = typeof e.idempotencyKey === 'string' && [...orderIds].some((id) => e.idempotencyKey!.includes(id));
      if (!byOrder && !keyIsOrder) continue;
      hits.push({
        evidence: [e.i],
        confidence: byOrder ? ('certain' as const) : ('likely' as const),
        mechanism: `The ledger ${e.op} at #${e.i} is keyed on the order id${keyIsOrder ? ` (${e.idempotencyKey})` : ''}. A purchase made with a promo code has no order id at all, and each renewal produces a new one, so duplicates slip through and rows collide.`,
        nextCheck: `Key on the purchase token, which is globally unique, and on the Pub/Sub messageId for notification-driven writes. Keep the order id for reconciliation and for matching refunds, where it is the right identifier. Check whether any row in your table has a null or empty order-id key.`,
      });
    }
    return hits;
  },
});
