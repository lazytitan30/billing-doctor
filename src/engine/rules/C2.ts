import { defineRule } from '../rule.js';
import { between, isOkGet, isStateWrite, rtdnBefore } from '../helpers.js';

// A write driven by an older notification after a newer one was already
// applied. Notifications are not ordered; state must come from the API.
export const C2 = defineRule({
  id: 'C2',
  group: 'C',
  severity: 'high',
  title: 'Older notification applied after a newer one',
  detects:
    'A ledger write driven by a notification whose eventTimeMillis is older than that of a notification already applied to the same token. Pub/Sub does not order messages; the write undid newer state.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      let newest: { eventTime: number; rtdnIndex: number; writeIndex: number } | undefined;
      for (const write of events.filter(isStateWrite)) {
        if (!write.messageId) continue;
        const rtdn = rtdnBefore(tl, write.messageId, write);
        if (!rtdn || rtdn.eventTimeMillis === undefined) continue;
        if (newest && rtdn.eventTimeMillis < newest.eventTime) {
          const refetched = between(events, rtdn, write).some(isOkGet);
          hits.push({
            evidence: [newest.rtdnIndex, newest.writeIndex, rtdn.i, write.i],
            confidence: refetched ? ('likely' as const) : ('certain' as const),
            mechanism: `For ${token}, notification #${rtdn.i} (event time ${new Date(rtdn.eventTimeMillis).toISOString()}) drove write #${write.i} after write #${newest.writeIndex} had already applied the newer notification #${newest.rtdnIndex} (event time ${new Date(newest.eventTime).toISOString()}).${refetched ? ' The backend fetched the resource in between, so check whether the write used the fetched state or the notification.' : ' No fetch happened in between: the write came from the notification alone.'}`,
            nextCheck: `Compare the ledger row for ${token} with purchases.subscriptionsv2.get now. Write state from the fetched resource on every notification, and ignore a notification whose eventTimeMillis is older than the last one applied.`,
          });
        }
        if (!newest || rtdn.eventTimeMillis > newest.eventTime) {
          newest = { eventTime: rtdn.eventTimeMillis, rtdnIndex: rtdn.i, writeIndex: write.i };
        }
      }
    }
    return hits;
  },
});
