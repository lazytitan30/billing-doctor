import { defineRule } from '../rule.js';
import { isGrant, isLedger, isOkGet, precedes, productOf, tokenEvents, type LedgerEv } from '../helpers.js';

// An in-app re-signup before expiry creates a new token linked to the old;
// a ledger that keeps writing the old token misses the live one.
export const F3 = defineRule({
  id: 'F3',
  group: 'F',
  severity: 'medium',
  title: 'In-app re-signup treated as the same token',
  detects:
    'A resource whose linkedPurchaseToken names a token with the same product, with no ledger grant for the new token and ledger writes continuing on the old one. Re-signing up in the app creates a new token; only a Play Store restore keeps it.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const read = events.find((e) => isOkGet(e) && typeof e.linkedPurchaseToken === 'string' && e.linkedPurchaseToken.length > 0);
      if (!read || !isOkGet(read)) continue;
      const linked = read.linkedPurchaseToken as string;
      if (productOf(tl, linked) !== productOf(tl, token)) continue;
      if (events.some((e) => isGrant(e) && precedes(read, e))) continue;
      const oldWrite = tokenEvents(tl, linked).find((e): e is LedgerEv => isLedger(e) && e.op !== 'revoke' && e.op !== 'lookup' && precedes(read, e));
      if (!oldWrite) continue;
      hits.push({
        evidence: [read.i, oldWrite.i],
        confidence: 'certain' as const,
        mechanism: `${token} is a re-signup linked to ${linked} for the same product (#${read.i}); the ledger never granted ${token} and kept writing ${linked} (#${oldWrite.i}), which Google marked expired at the replacement.`,
        nextCheck: `Bind the user to ${token}, revoke ${linked}, and make the verify path treat a resource with linkedPurchaseToken as a new token that supersedes the old.`,
      });
    }
    return hits;
  },
});
