import { defineRule } from '../rule.js';
import { isOkGet, isPurchaseResult, precedes, tokenEvents } from '../helpers.js';

// An upgrade that drops the obfuscated account id loses the only link Google
// echoes back on later notifications.
export const F6 = defineRule({
  id: 'F6',
  group: 'F',
  severity: 'medium',
  title: 'Upgrade launched without the obfuscated account id the old subscription had',
  detects:
    'A replacement purchase with no obfuscated account id, where the resource for the token it replaces carried one. Google says the same id should be passed on upgrades and downgrades.',
  run(tl) {
    const hits = [];
    for (const purchase of tl.events) {
      if (!isPurchaseResult(purchase) || !purchase.oldToken) continue;
      if (purchase.obfuscatedAccountId) continue;
      const old = [...tokenEvents(tl, purchase.oldToken)]
        .reverse()
        .find((e) => isOkGet(e) && e.externalAccountIdentifiers?.obfuscatedExternalAccountId && precedes(e, purchase));
      if (!old || !isOkGet(old)) continue;
      hits.push({
        evidence: [old.i, purchase.i],
        confidence: 'certain' as const,
        mechanism: `${purchase.oldToken} was bought with an obfuscated account id (#${old.i}); the replacement at #${purchase.i} carried none. Every later notification for the new token will come back with nothing to match a user against.`,
        nextCheck: `Pass the same obfuscated account id in the billing flow parameters for upgrades, downgrades and re-signups. Then check whether renewals for this new token can still be mapped to the user, which is what H1 catches.`,
      });
    }
    return hits;
  },
});
