import { defineRule } from '../rule.js';
import { isGrant, isLedger, isOkGet, precedes } from '../helpers.js';

// Resubscribing from the Play Store after the old subscription fully expired is
// a brand new purchase with no linked token. The link lives somewhere else.
export const F5 = defineRule({
  id: 'F5',
  group: 'F',
  severity: 'high',
  title: 'Out-of-app resubscribe not linked to the expired subscription',
  detects:
    'A resource carrying outOfAppPurchaseContext where the backend either matched no user or granted without reading it. The expired token and the old obfuscated ids are in that field and nowhere else, because a fully lapsed resubscribe has no linkedPurchaseToken.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const read = events.find((e) => isOkGet(e) && e.outOfAppPurchaseContext !== undefined);
      if (!read || !isOkGet(read)) continue;
      const expired = (read.outOfAppPurchaseContext as { expiredPurchaseToken?: string } | undefined)?.expiredPurchaseToken;
      const usedIt = expired !== undefined && tl.events.some((e) => isLedger(e) && (e.token === expired || e.note?.includes(expired)) && precedes(read, e));
      if (usedIt) continue;
      const unmatched = events.find((e) => isLedger(e) && e.op === 'lookup' && e.matchedUsers === 0 && precedes(read, e));
      const granted = events.find((e) => isGrant(e) && precedes(read, e));
      if (!unmatched && !granted) continue;
      hits.push({
        evidence: unmatched ? [read.i, unmatched.i] : [read.i, granted!.i],
        confidence: unmatched ? ('certain' as const) : ('likely' as const),
        mechanism: `${token} is a resubscribe made outside the app, and its resource at #${read.i} carries outOfAppPurchaseContext${expired ? ` naming ${expired} as the expired token` : ''}. ${unmatched ? `The lookup at #${unmatched.i} matched no user.` : `The grant at #${granted!.i} did not use it.`} There is no linkedPurchaseToken on this kind of purchase, because the old subscription had fully expired.`,
        nextCheck: `Read outOfAppPurchaseContext before acknowledging: expiredPurchaseToken names the previous subscription and expiredExternalAccountIdentifiers carries the obfuscated ids it was bought with. Look the user up by either, then bind the new token. The field is present only while the purchase is unacknowledged, so this is the one chance to use it.`,
      });
    }
    return hits;
  },
});
