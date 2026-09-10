import { defineRule } from '../rule.js';
import { isApi, isOk, isOkGet, isRevoke, precedes } from '../helpers.js';

// Refunding an older order returns the money and leaves the subscription alone.
export const G7 = defineRule({
  id: 'G7',
  group: 'G',
  severity: 'medium',
  title: 'Refund of an order that is not the latest, treated as ending the subscription',
  detects:
    'A refund of an order id that the resource does not name as the latest one, followed by a ledger revoke. Only refunding the most recent order removes the subscription; refunding an older one changes nothing at Google.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const refund = events.find((e) => isApi(e) && isOk(e.status) && e.call === 'orders.refund' && e.orderId);
      if (!refund || !isApi(refund)) continue;
      const known = [...events].reverse().find((e) => isOkGet(e) && e.latestOrderId && precedes(e, refund));
      if (!known || !isOkGet(known) || known.latestOrderId === refund.orderId) continue;
      const revoke = events.find((e) => isRevoke(e) && precedes(refund, e));
      if (!revoke) continue;
      hits.push({
        evidence: [known.i, refund.i, revoke.i],
        confidence: 'certain' as const,
        mechanism: `The resource at #${known.i} names ${known.latestOrderId} as the latest order; the refund at #${refund.i} was for ${refund.orderId}, an earlier one. The ledger revoked at #${revoke.i}, but at Google the subscription is still running and will renew.`,
        nextCheck: `Decide which you meant. To end it, refund the most recent order, or call the revoke endpoint, which stops renewal and access together. To refund one period only, leave the entitlement alone: the user keeps the subscription they are still paying for. Check whether this one renewed after the refund.`,
      });
    }
    return hits;
  },
});
