import { defineRule } from '../rule.js';
import { isLedger, isOkGet, precedes } from '../helpers.js';

// No obfuscated account id on the resource, and a token no row claims: the
// notification cannot be mapped to anyone.
export const H1 = defineRule({
  id: 'H1',
  group: 'H',
  severity: 'high',
  title: 'Notification could not be mapped to a user: no obfuscated account id and no token binding',
  detects:
    'A resource carrying no obfuscated account id, and a ledger lookup for the token that matched no user. Set an obfuscated account id at purchase time; it is the only link when the verify call never ran.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const read = events.find(
        (e) =>
          isOkGet(e) &&
          !e.externalAccountIdentifiers?.obfuscatedExternalAccountId &&
          // A resubscribe made outside the app carries the old ids in
          // outOfAppPurchaseContext instead, and F5 says to read them.
          e.outOfAppPurchaseContext === undefined,
      );
      if (!read) continue;
      const lookup = events.find((e) => isLedger(e) && e.op === 'lookup' && e.matchedUsers === 0 && precedes(read, e));
      if (!lookup) continue;
      hits.push({
        evidence: [read.i, lookup.i],
        confidence: 'certain' as const,
        mechanism: `The resource for ${token} (#${read.i}) carries no obfuscated account id and the lookup at #${lookup.i} matched no user, so whatever this notification announced was applied to nobody.`,
        nextCheck: `Find the buyer from the order id in the Play Console and bind the token by hand. Then pass setObfuscatedAccountId (an HMAC of the user id) on every purchase, store the pseudonym on the user row, and fall back to it in the notification handler.`,
      });
    }
    return hits;
  },
});
