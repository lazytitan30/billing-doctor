import { defineRule } from '../rule.js';
import { isOkGet, isRevoke, isRtdn, isSubscriptionNotification, precedes } from '../helpers.js';

// A scheduled cancellation on an installment plan takes effect at the end of
// the commitment period, not now.
export const E5 = defineRule({
  id: 'E5',
  group: 'E',
  severity: 'medium',
  title: 'SUBSCRIPTION_CANCELLATION_SCHEDULED treated as immediate',
  detects:
    'A type 18 notification followed by a ledger revoke before any CANCELED or EXPIRED notification or an EXPIRED read. The cancellation is pending until the end of the commitment period.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const rtdn of events.filter((e) => isSubscriptionNotification(e, 18))) {
        const revoke = events.find((e) => isRevoke(e) && precedes(rtdn, e));
        if (!revoke) continue;
        const ended = events.some(
          (e) =>
            precedes(rtdn, e) &&
            precedes(e, revoke) &&
            ((isRtdn(e) && (e.notificationType === 3 || e.notificationType === 13 || e.notificationType === 12)) ||
              (isOkGet(e) && e.subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED')),
        );
        if (ended) continue;
        hits.push({
          evidence: [rtdn.i, revoke.i],
          confidence: 'certain' as const,
          mechanism: `${token} received SUBSCRIPTION_CANCELLATION_SCHEDULED at #${rtdn.i} and the ledger revoked at #${revoke.i}, with no CANCELED, EXPIRED or REVOKED in between. Payments remain in the commitment period.`,
          nextCheck: `Fetch ${token}: it still reads ACTIVE with an expiryTime at the end of the commitment period. Restore access, and treat type 18 as a note that renewal will stop, not as a state change.`,
        });
      }
    }
    return hits;
  },
});
