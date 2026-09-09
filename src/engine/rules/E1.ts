import { defineRule } from '../rule.js';
import { grantedBefore, isGrant, isRevoke, isSubscriptionNotification, precedes } from '../helpers.js';

// RECOVERED means access returns; a ledger that stays revoked leaves a paying user out.
export const E1 = defineRule({
  id: 'E1',
  group: 'E',
  severity: 'high',
  title: 'SUBSCRIPTION_RECOVERED with no re-grant',
  detects:
    'A type 1 notification for a token the ledger holds revoked, with no grant afterwards. Recovery from hold or pause means the user is paying again and access returns.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const rtdn of events.filter((e) => isSubscriptionNotification(e, 1))) {
        if (grantedBefore(events, rtdn)) continue;
        if (events.some((e) => isGrant(e) && precedes(rtdn, e))) continue;
        const revoke = [...events].reverse().find((e) => isRevoke(e) && precedes(e, rtdn));
        hits.push({
          evidence: revoke ? [revoke.i, rtdn.i] : [rtdn.i],
          confidence: 'likely' as const,
          mechanism: `${token} was revoked at #${revoke?.i ?? '?'} and SUBSCRIPTION_RECOVERED arrived at #${rtdn.i}; nothing granted it again.`,
          nextCheck: `Fetch purchases.subscriptionsv2.get for ${token}: if it reads ACTIVE, grant now. Make the handler re-grant on type 1 after a fetch confirms ACTIVE.`,
        });
      }
    }
    return hits;
  },
});
