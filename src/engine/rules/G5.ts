import { defineRule } from '../rule.js';
import { isApi, isApiRevoke, isOk, precedes } from '../helpers.js';

// A refund returns money; only revoke ends access and future payments.
export const G5 = defineRule({
  id: 'G5',
  group: 'G',
  severity: 'high',
  title: 'Refund issued without revoking access',
  detects:
    'An orders.refund call without revoke set to true, or a v1 subscriptions.refund, with no revoke at Google afterwards. Without revoke the user keeps access and a subscription keeps renewing.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const refund = events.find(
        (e) => isApi(e) && isOk(e.status) && ((e.call === 'orders.refund' && e.revoke !== true) || e.call === 'subscriptions.refund'),
      );
      if (!refund || !isApi(refund)) continue;
      if (events.some((e) => isApiRevoke(e) && precedes(refund, e))) continue;
      hits.push({
        evidence: [refund.i],
        confidence: 'certain' as const,
        mechanism: `${refund.call} for ${token} at #${refund.i} returned the money${refund.call === 'orders.refund' ? ' with revoke unset' : ''}; no revoke followed at Google, so access and future renewals continue.`,
        nextCheck: `Call purchases.subscriptionsv2.revoke for ${token}, or orders.refund with revoke=true next time, and revoke in the ledger too.`,
      });
    }
    return hits;
  },
});
