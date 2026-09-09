import { defineRule } from '../rule.js';
import { HOUR_MS, isAckOrConsume, isOkGet, isPurchaseResult, isRevokedNotification, isVoided, iso } from '../helpers.js';

// A purchase that was never acknowledged inside the window, and later Google
// voided or revoked it. The whole chain is visible, so the confidence is certain.
export const B1 = defineRule({
  id: 'B1',
  group: 'B',
  severity: 'high',
  title: 'Purchase never acknowledged; Google refunded it and revoked the entitlement',
  detects:
    'A PURCHASED result or an unacknowledged resource with no acknowledgement or consumption inside policy.ackWithinHours, followed by a voided or revoked notification for the same token. Google refunds and revokes unacknowledged purchases after three days.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const purchase = events.find(
        (e) =>
          (isPurchaseResult(e) && e.purchaseState === 'PURCHASED') ||
          (isOkGet(e) && e.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'),
      );
      if (!purchase) continue;
      const windowEnd = purchase.tMs + tl.policy.ackWithinHours * HOUR_MS;
      if (events.some((e) => isAckOrConsume(e) && e.tMs <= windowEnd)) continue;
      const loss = events.find((e) => e.tMs > purchase.tMs && (isVoided(e) || isRevokedNotification(e)));
      if (!loss) continue;
      const how = isVoided(loss) ? 'voided (refunded)' : 'revoked';
      hits.push({
        evidence: [purchase.i, loss.i],
        confidence: 'certain' as const,
        mechanism: `${token} was purchased at ${iso(purchase.tMs)} and nothing acknowledged or consumed it within ${tl.policy.ackWithinHours} hours; at ${iso(loss.tMs)} Google ${how} it, as its rule says it will after three days.`,
        nextCheck: `Search the backend log for the acknowledge call for ${token}. If the call was made and failed, see B8; if it was never made, add it to the verify path and a watchdog that retries inside the three-day window.`,
      });
    }
    return hits;
  },
});
