import { defineRule } from '../rule.js';
import {
  HOUR_MS,
  hasServerView,
  hoursBetween,
  isAckAttempt,
  isAckOrConsume,
  isOkGet,
  isPrepaidGet,
  isPurchaseResult,
  isRevokedNotification,
  isVoided,
  iso,
  purchaseStateOf,
} from '../helpers.js';

// Nothing acknowledged the purchase, the window closed, and the file records
// no refund. Google's clock does not need the file to see it.
export const B14 = defineRule({
  id: 'B14',
  group: 'B',
  severity: 'high',
  title: 'Purchase never acknowledged inside the window, with no refund recorded yet',
  detects:
    'A PURCHASED result or an unacknowledged resource with no acknowledgement or consumption of any kind, no failed attempt and no refund or revocation for the token, in a timeline that runs on past policy.ackWithinHours. Google refunds and revokes an unacknowledged purchase after three days whether or not anything wrote that down.',
  run(tl) {
    const hits = [];
    const serverView = hasServerView(tl);
    for (const [token, events] of tl.byToken) {
      // The window opens when the purchase reads PURCHASED. A resource read
      // while it was still PENDING carries ACKNOWLEDGEMENT_STATE_PENDING too,
      // and a pending purchase that is later cancelled never opens a window.
      const purchase = events.find(
        (e) =>
          purchaseStateOf(e) === 'PURCHASED' &&
          (isPurchaseResult(e) || (isOkGet(e) && e.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING')),
      );
      if (!purchase) continue;
      const windowEnd = purchase.tMs + tl.policy.ackWithinHours * HOUR_MS;
      // Inside the window there is nothing to say yet.
      if (tl.endMs <= windowEnd) continue;
      // Acknowledged on the device, from the backend, in the ledger, or as
      // Google's own record on a later read: any of them settles it.
      if (events.some((e) => isAckOrConsume(e) || (isOkGet(e) && e.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'))) continue;
      // An attempt that failed is B8's; the refund that followed is B1's; a
      // prepaid plan has its own window and is B9's.
      if (events.some((e) => isAckAttempt(e) || isVoided(e) || isRevokedNotification(e) || isPrepaidGet(e))) continue;
      hits.push({
        evidence: [purchase.i],
        confidence: serverView ? ('likely' as const) : ('possible' as const),
        mechanism: `${token} was purchased at ${iso(purchase.tMs)} (#${purchase.i}) and nothing in this timeline acknowledged or consumed it, on the device or from the backend, inside ${tl.policy.ackWithinHours} hours; the timeline runs ${hoursBetween(windowEnd, tl.endMs)} hours past that window with no refund recorded. ${serverView ? "The backend's events are here and none of them is an acknowledgement." : 'This timeline carries nothing from the server, so an acknowledgement made there would not show here; if the backend made none, Google has refunded this purchase by now.'}`,
        nextCheck: `Read the resource for ${token}: acknowledgementState says whether anything acknowledged it, and a refunded or expired state says what Google did. Then put the acknowledgement where it belongs, after verification on the backend, and add a watchdog that acknowledges anything still pending inside the window.`,
      });
    }
    return hits;
  },
});
