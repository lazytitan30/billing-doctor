import { defineRule } from '../rule.js';
import { between, isOkGet, isRevoke, isSubscriptionNotification, precedes } from '../helpers.js';

// A scheduled pause is not a pause. Access runs to the next renewal.
export const E7 = defineRule({
  id: 'E7',
  group: 'E',
  severity: 'medium',
  title: 'Access removed when a pause was only scheduled',
  detects:
    'A type 11 notification followed by a ledger revoke, with no fetch reading PAUSED in between. The user asked to pause later and keeps access until the next renewal date.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const rtdn of events.filter((e) => isSubscriptionNotification(e, 11))) {
        const revoke = events.find((e) => isRevoke(e) && precedes(rtdn, e));
        if (!revoke) continue;
        const paused = between(events, rtdn, revoke).some((e) => isOkGet(e) && e.subscriptionState === 'SUBSCRIPTION_STATE_PAUSED');
        if (paused) continue;
        hits.push({
          evidence: [rtdn.i, revoke.i],
          confidence: 'certain' as const,
          mechanism: `${token} had a pause scheduled at #${rtdn.i} and the ledger revoked at #${revoke.i}. Nothing in between read the state as paused, and at that point the resource still has auto-renew on.`,
          nextCheck: `Restore access until the renewal date. Treat type 11 as a note about the future and remove access on type 10, once a fetch reads PAUSED, which is what D5 checks.`,
        });
      }
    }
    return hits;
  },
});
