import { defineRule } from '../rule.js';
import { between, isOkGet, isStateWrite, rtdnBefore } from '../helpers.js';

// A state write driven by a notification with no API fetch in between.
export const C3 = defineRule({
  id: 'C3',
  group: 'C',
  severity: 'high',
  title: 'State written from a notification without re-fetching from Google',
  detects:
    'A ledger grant, revoke, expiry or write whose messageId points at a notification, with no successful purchases.*.get for the token between the two. The notification says what changed, not what is true.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const write of events.filter(isStateWrite)) {
        if (!write.messageId) continue;
        const rtdn = rtdnBefore(tl, write.messageId, write);
        if (!rtdn) continue;
        if (between(events, rtdn, write).some(isOkGet)) continue;
        hits.push({
          evidence: [rtdn.i, write.i],
          confidence: 'certain' as const,
          mechanism: `Notification #${rtdn.i} for ${token} led straight to ledger ${write.op} #${write.i}; no purchases.*.get answered 2xx in between.`,
          nextCheck: `Fetch purchases.subscriptionsv2.get (or productsv2.get) for ${token} now and compare with the ledger row. Make the handler fetch before every write and write the fetched state, not the notification type.`,
        });
      }
    }
    return hits;
  },
});
