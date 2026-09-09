import { defineRule } from '../rule.js';
import { isGrant, isRevoke } from '../helpers.js';

// The same token granted twice without a revoke in between: double credit.
export const B7 = defineRule({
  id: 'B7',
  group: 'B',
  severity: 'high',
  title: 'Same token granted twice',
  detects:
    'Two ledger grants for one token with no revoke between them. A second grant of a consumable cannot be rolled back, and it is how a retry turns into double credit.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      let standing: number | undefined;
      for (const e of events) {
        if (isRevoke(e)) standing = undefined;
        if (!isGrant(e)) continue;
        if (standing !== undefined) {
          hits.push({
            evidence: [standing, e.i],
            confidence: 'certain' as const,
            mechanism: `${token} was granted at #${standing} and again at #${e.i} with no revoke between. Whatever the second grant added, the user has it twice.`,
            nextCheck: `Look at what triggered the second grant (a client retry of the verify call, a redelivered notification, a restore). Make the grant idempotent on the token: claim the token in a ledger row first, and on a conflict retry only the acknowledgement, never the grant.`,
          });
        }
        standing = e.i;
      }
    }
    return hits;
  },
});
