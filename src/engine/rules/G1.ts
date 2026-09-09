import { defineRule } from '../rule.js';
import { grantedBefore, isGrant, isRevoke, isRevokedNotification, precedes } from '../helpers.js';

// Revoked before expiry: access ends now.
export const G1 = defineRule({
  id: 'G1',
  group: 'G',
  severity: 'high',
  title: 'SUBSCRIPTION_REVOKED with the ledger still granting',
  detects:
    'A type 12 notification for a granted token with no ledger revoke afterwards, or a grant afterwards. Revoked means access ended before the expiration time.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const rtdn of events.filter(isRevokedNotification)) {
        if (!grantedBefore(events, rtdn)) continue;
        if (events.some((e) => isRevoke(e) && precedes(rtdn, e))) continue;
        const regrant = events.find((e) => isGrant(e) && precedes(rtdn, e));
        const standing = [...events].reverse().find((e) => isGrant(e) && precedes(e, rtdn));
        hits.push({
          evidence: regrant ? [standing!.i, rtdn.i, regrant.i] : [standing!.i, rtdn.i],
          confidence: regrant ? ('certain' as const) : ('likely' as const),
          mechanism: `${token} was revoked by Google at #${rtdn.i}; the ledger ${regrant ? `granted it again at #${regrant.i}` : `still holds the grant from #${standing!.i} and never revoked`}.`,
          nextCheck: `Fetch purchases.subscriptionsv2.get for ${token}; if it reads EXPIRED or is gone (404), revoke now. Make the type 12 path fetch and revoke.`,
        });
      }
    }
    return hits;
  },
});
