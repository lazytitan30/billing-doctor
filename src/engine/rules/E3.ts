import { defineRule } from '../rule.js';
import { expiryOf, isLedger, isOkGet, isSubscriptionNotification, iso, precedes, type ApiEv, type LedgerEv } from '../helpers.js';

// A deferral moved the renewal date; the stored expiry must follow.
export const E3 = defineRule({
  id: 'E3',
  group: 'E',
  severity: 'medium',
  title: 'SUBSCRIPTION_DEFERRED with the old expiry kept',
  detects:
    'A type 9 notification followed by a fetch with a new expiryTime, and a ledger that stored a different expiry or none at all afterwards. A deferral moves the renewal one day to one year; expiryTime must be re-read.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const rtdn of events.filter((e) => isSubscriptionNotification(e, 9))) {
        const read = events.find((e): e is ApiEv => isOkGet(e) && precedes(rtdn, e));
        if (!read) continue;
        const answered = expiryOf(read);
        if (answered === undefined) continue;
        const stored = events.find((e): e is LedgerEv => isLedger(e) && e.expiry !== undefined && precedes(read, e));
        if (stored && Math.abs(Date.parse(stored.expiry!) - answered) <= 60_000) continue;
        hits.push({
          evidence: stored ? [rtdn.i, read.i, stored.i] : [rtdn.i, read.i],
          confidence: stored ? ('certain' as const) : ('likely' as const),
          mechanism: `${token} was deferred at #${rtdn.i} and the fetch at #${read.i} answered expiryTime ${iso(answered)}; ${stored ? `the ledger stored ${stored.expiry} at #${stored.i}` : 'no ledger expiry was written afterwards'}.`,
          nextCheck: `Compare the ledger row for ${token} with lineItems[].expiryTime now, and make the type 9 path store the fetched expiry.`,
        });
      }
    }
    return hits;
  },
});
