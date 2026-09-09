import { defineRule } from '../rule.js';
import { isApiRevoke, isRevoke, isRtdn, isVoided, precedes } from '../helpers.js';

// A pending refund review is a question with a 24-hour window, not a refund.
export const C6 = defineRule({
  id: 'C6',
  group: 'C',
  severity: 'high',
  title: 'Access revoked on a pending refund review',
  detects:
    'A pendingRefundReviewNotification followed by a ledger revoke, or a developer revoke at Google, for the same token or order, before any voided-purchase notification. The review asks for the developer\'s opinion; access changes only when the purchase is voided.',
  run(tl) {
    const hits = [];
    for (const review of tl.events.filter((e) => isRtdn(e) && e.notification === 'pendingRefundReview')) {
      const orderId = (review as { orderId?: string }).orderId;
      const matches = (e: { token?: string; orderId?: string }) =>
        (review.token !== undefined && e.token === review.token) || (orderId !== undefined && e.orderId === orderId);
      const revoke = tl.events.find((e) => precedes(review, e) && (isRevoke(e) || isApiRevoke(e)) && matches(e as { token?: string; orderId?: string }));
      if (!revoke) continue;
      const voidedFirst = tl.events.some((e) => isVoided(e) && precedes(review, e) && precedes(e, revoke) && matches(e));
      if (voidedFirst) continue;
      hits.push({
        evidence: [review.i, revoke.i],
        confidence: 'certain' as const,
        mechanism: `A chargeback review arrived at #${review.i} and ${isApiRevoke(revoke) ? 'the backend revoked the purchase at Google' : 'the ledger revoked access'} at #${revoke.i} with no voided-purchase notification in between.`,
        nextCheck: `Answer the review through orders.reviewRefund inside 24 hours with your preference and usage evidence, and restore access until a voidedPurchaseNotification says the money went back.`,
      });
    }
    return hits;
  },
});
