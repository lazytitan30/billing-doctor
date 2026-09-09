import { defineRule } from '../rule.js';
import { isAck, isOkGet, isPrepaidGet, isSubscriptionNotification, precedes } from '../helpers.js';

// An acknowledgement after a renewal notification. Harmless, and unnecessary:
// only the initial purchase (and prepaid top-ups) need acknowledging.
export const B4 = defineRule({
  id: 'B4',
  group: 'B',
  severity: 'info',
  title: 'Acknowledgement sent for a subscription renewal',
  detects:
    'An acknowledgement after a SUBSCRIPTION_RENEWED notification for an auto-renewing subscription. Renewals do not need acknowledging; prepaid top-ups do and are skipped here.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const lastGet = [...events].reverse().find(isOkGet);
      if (lastGet && isPrepaidGet(lastGet)) continue;
      for (const ack of events.filter(isAck)) {
        const renewal = [...events].reverse().find((e) => isSubscriptionNotification(e, 2) && precedes(e, ack));
        if (!renewal) continue;
        hits.push({
          evidence: [renewal.i, ack.i],
          confidence: 'certain' as const,
          mechanism: `${token} renewed (notification #${renewal.i}) and the backend acknowledged it again at #${ack.i}. Google needs the acknowledgement once, at the initial purchase.`,
          nextCheck: `Confirm the acknowledgementState on the resource is already ACKNOWLEDGED after the first purchase; then drop the acknowledge call from the renewal path.`,
        });
      }
    }
    return hits;
  },
});
