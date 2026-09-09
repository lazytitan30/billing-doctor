import { defineRule } from '../rule.js';
import { isOkGet, isRevoke, isVoided, precedes } from '../helpers.js';

// The void is the fact: the money went back. The resource can still read ACTIVE.
export const G2 = defineRule({
  id: 'G2',
  group: 'G',
  severity: 'high',
  title: 'Voided purchase, then a fetch reading ACTIVE, and no revoke',
  detects:
    'A full voided-purchase notification for a token, a later fetch answering ACTIVE, and no ledger revoke after the void. The refund is the fact; the state read can lag behind it.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const voided = events.find(isVoided);
      if (!voided) continue;
      if (events.some((e) => isRevoke(e) && !precedes(e, voided))) continue;
      const read = events.find((e) => isOkGet(e) && precedes(voided, e) && e.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE');
      if (!read) continue;
      hits.push({
        evidence: [voided.i, read.i],
        confidence: 'certain' as const,
        mechanism: `${token} was voided at #${voided.i} (the money went back); the fetch at #${read.i} still answered ACTIVE and the ledger never revoked, so the refunded user keeps the tier.`,
        nextCheck: `Revoke ${token} now. In the handler, act on voidedPurchaseNotification directly: mark refunded and revoke, regardless of what subscriptionsv2.get answers afterwards.`,
      });
    }
    return hits;
  },
});
