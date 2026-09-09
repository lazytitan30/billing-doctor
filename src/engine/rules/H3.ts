import { defineRule } from '../rule.js';
import { isLedger } from '../helpers.js';

// One token, several rows, a findOne: the wrong user gets the update.
export const H3 = defineRule({
  id: 'H3',
  group: 'H',
  severity: 'medium',
  title: 'Token looked up with findOne while several users share it',
  detects:
    'A ledger lookup of kind findOne that matched more than one user. After account merges and family sharing one token can sit on several rows; match on the pseudonym Google echoes back first, and enforce one row per token.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const lookup = events.find((e) => isLedger(e) && e.op === 'lookup' && e.lookup === 'findOne' && (e.matchedUsers ?? 0) > 1);
      if (!lookup || !isLedger(lookup)) continue;
      hits.push({
        evidence: [lookup.i],
        confidence: 'certain' as const,
        mechanism: `${token} matched ${lookup.matchedUsers} users at #${lookup.i} and findOne picked one of them. A cancellation downgrades one row and every other row keeps the tier.`,
        nextCheck: `Resolve the user by the obfuscated account id on the resource first, then by token; add a unique index on the token column and decide what a second row means (merge, or refuse).`,
      });
    }
    return hits;
  },
});
