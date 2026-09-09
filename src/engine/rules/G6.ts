import { defineRule } from '../rule.js';
import { isApi, isOk, isOkGet, isRevoke, isRtdn, precedes } from '../helpers.js';

// Cancel stops renewal; the user keeps what they paid for. A ledger revoke
// after a developer cancel takes away a paid period.
export const G6 = defineRule({
  id: 'G6',
  group: 'G',
  severity: 'medium',
  title: 'Developer cancel used where revoke was meant',
  detects:
    'A subscriptionsv2.cancel or subscriptions.cancel call followed by a ledger revoke for the token before any EXPIRED or REVOKED signal. Cancel only stops renewal; Google keeps the user\'s access until expiryTime.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const cancel = events.find((e) => isApi(e) && isOk(e.status) && (e.call === 'subscriptionsv2.cancel' || e.call === 'subscriptions.cancel'));
      if (!cancel) continue;
      const revoke = events.find((e) => isRevoke(e) && precedes(cancel, e));
      if (!revoke) continue;
      const ended = events.some(
        (e) =>
          precedes(cancel, e) &&
          precedes(e, revoke) &&
          ((isRtdn(e) && (e.notificationType === 12 || e.notificationType === 13)) ||
            (isOkGet(e) && e.subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED')),
      );
      if (ended) continue;
      hits.push({
        evidence: [cancel.i, revoke.i],
        confidence: 'certain' as const,
        mechanism: `The backend cancelled ${token} at Google (#${cancel.i}), which only stops renewal, then revoked access in the ledger at #${revoke.i}. Google still grants the paid period; the ledger does not.`,
        nextCheck: `Decide which was meant. To end access now, call purchases.subscriptionsv2.revoke (with a refund context); to stop renewal only, keep access until expiryTime and revoke on EXPIRED.`,
      });
    }
    return hits;
  },
});
