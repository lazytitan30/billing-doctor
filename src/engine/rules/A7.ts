import { defineRule } from '../rule.js';
import { MIN_MS, hasServerView, isApi, isPurchaseResult, isRtdn, productTypeOf } from '../helpers.js';

// One-time product notifications are published only if you opted into them.
export const A7 = defineRule({
  id: 'A7',
  group: 'A',
  severity: 'medium',
  title: 'One-time products sold, but their notifications were never enabled',
  detects:
    'One-time purchases in a timeline that carries some record from the backend, and no notification of that kind anywhere, with the Console setting either declared off or unknown. Purchases, cancellations and refunds of those products are then invisible to the backend.',
  run(tl) {
    if (!hasServerView(tl)) return [];
    const oneTime = tl.events.find((e) => {
      if (isPurchaseResult(e)) return ['consumable', 'non-consumable'].includes(productTypeOf(tl, e.productId) ?? '');
      return isApi(e) && (e.call === 'productsv2.get' || e.call === 'products.get');
    });
    if (!oneTime) return [];
    // Any notification that concerns a one-time product proves they arrive:
    // the dedicated kind, or a voided purchase whose productType is one-time.
    const heard = tl.events.some(
      (e) => isRtdn(e) && (e.notification === 'oneTimeProduct' || (e.notification === 'voidedPurchase' && e.productType === 2)),
    );
    if (heard) return [];
    const declared = tl.config.rtdn?.oneTimeProductNotifications;
    if (declared === true) return [];
    if (declared === undefined && tl.endMs - oneTime.tMs < 15 * MIN_MS) return [];
    return [
      {
        evidence: [oneTime.i],
        confidence: declared === false ? ('certain' as const) : ('likely' as const),
        mechanism: `A one-time product was bought at #${oneTime.i} and no one-time notification appears anywhere in the timeline. ${declared === false ? 'The configuration says those notifications are not enabled.' : 'The configuration does not say whether they are enabled.'}`,
        nextCheck: `In the Play Console, Monetization setup, choose the notification option that covers one-time products as well as subscriptions. Until then, a refunded or cancelled one-time purchase reaches you only through a voidedpurchases sweep, which looks back thirty days at most.`,
      },
    ];
  },
});
