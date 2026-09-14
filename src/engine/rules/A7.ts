import { defineRule } from '../rule.js';
import { MIN_MS, hasServerView, isGrant, isOkGet, isPurchaseResult, isRtdn, productOf, productTypeOf } from '../helpers.js';

const ONE_TIME = new Set(['consumable', 'non-consumable']);

// One-time product notifications are published only if you opted into them.
export const A7 = defineRule({
  id: 'A7',
  group: 'A',
  severity: 'medium',
  title: 'One-time products sold, but their notifications were never enabled',
  detects:
    'A one-time product sold (a purchase result on the device, a products read Google answered, or a ledger grant of one) in a timeline that carries some record from the backend, with no notification of that kind anywhere and the Console setting declared off or unknown. Purchases, cancellations and refunds of those products are then invisible to the backend.',
  run(tl) {
    if (!hasServerView(tl)) return [];
    const isOneTime = (productId: string | undefined) => ONE_TIME.has(productTypeOf(tl, productId) ?? '');
    // A sale, not a read: on the 2026-09-13 sample a products.get that Google
    // refused with 401 was taken as proof that a one-time product had been
    // bought. A read Google answered is a purchase Google has; a refused one
    // proves nothing was sold.
    const sold = tl.events.find((e) => {
      if (isPurchaseResult(e)) return isOneTime(e.productId);
      if (isOkGet(e)) return e.call === 'productsv2.get' || e.call === 'products.get';
      if (isGrant(e)) return isOneTime(e.token ? productOf(tl, e.token) : undefined);
      return false;
    });
    if (!sold) return [];
    // Any notification that concerns a one-time product proves they arrive:
    // the dedicated kind, or a voided purchase whose productType is one-time.
    const heard = tl.events.some(
      (e) => isRtdn(e) && (e.notification === 'oneTimeProduct' || (e.notification === 'voidedPurchase' && e.productType === 2)),
    );
    if (heard) return [];
    const declared = tl.config.rtdn?.oneTimeProductNotifications;
    if (declared === true) return [];
    if (declared === undefined && tl.endMs - sold.tMs < 15 * MIN_MS) return [];
    return [
      {
        evidence: [sold.i],
        confidence: declared === false ? ('certain' as const) : ('likely' as const),
        mechanism: `A one-time product was bought at #${sold.i} and no one-time notification appears anywhere in the timeline. ${declared === false ? 'The configuration says those notifications are not enabled.' : 'The configuration does not say whether they are enabled.'}`,
        nextCheck: `In the Play Console, Monetization setup, choose the notification option that covers one-time products as well as subscriptions. Until then, a refunded or cancelled one-time purchase reaches you only through a voidedpurchases sweep, which looks back thirty days at most.`,
      },
    ];
  },
});
