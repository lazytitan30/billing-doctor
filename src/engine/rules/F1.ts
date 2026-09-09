import { defineRule } from '../rule.js';
import { isGrant, isOkGet, isRevoke, precedes, tokenEvents } from '../helpers.js';

// The replaced token must be invalidated, or the user has both tiers.
export const F1 = defineRule({
  id: 'F1',
  group: 'F',
  severity: 'high',
  title: 'Linked purchase token still granting after a replacement',
  detects:
    'A resource carrying linkedPurchaseToken, the new token granted, and the linked token still granted with no revoke afterwards. Google says to invalidate the old token so it cannot be used for access.',
  run(tl) {
    const hits = [];
    const seen = new Set<string>();
    for (const [token, events] of tl.byToken) {
      const read = events.find((e) => isOkGet(e) && typeof e.linkedPurchaseToken === 'string' && e.linkedPurchaseToken.length > 0);
      if (!read || !isOkGet(read)) continue;
      const linked = read.linkedPurchaseToken as string;
      if (seen.has(linked)) continue;
      // If the new token was never granted, the user has one tier on the wrong
      // token: that is F3's finding, not this one.
      if (!events.some((e) => isGrant(e) && !precedes(e, read))) continue;
      const old = tokenEvents(tl, linked);
      const standing = [...old].reverse().find((e) => (isGrant(e) || isRevoke(e)) && precedes(e, read));
      if (!standing || !isGrant(standing)) continue;
      if (old.some((e) => isRevoke(e) && !precedes(e, read))) continue;
      seen.add(linked);
      const regrant = old.find((e) => isGrant(e) && precedes(read, e));
      hits.push({
        evidence: regrant ? [standing.i, read.i, regrant.i] : [standing.i, read.i],
        confidence: regrant ? ('certain' as const) : ('likely' as const),
        mechanism: `${token} replaced ${linked} (linkedPurchaseToken at #${read.i}); the ledger granted ${linked} at #${standing.i} and ${regrant ? `granted it again at #${regrant.i}` : 'never revoked it'}. The user holds both.`,
        nextCheck: `Revoke ${linked} now and check the user has one tier. On every fetch, read linkedPurchaseToken and revoke the token it names before granting the new one.`,
      });
    }
    return hits;
  },
});
