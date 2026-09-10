import { defineRule } from '../rule.js';
import { isGrant, isOkGet, isRevoke, precedes, productTypeOf, type ApiEv, type LedgerEv } from '../helpers.js';

// Two live subscriptions for one user, with nothing linking them. A plan
// change launched without the old token is not a plan change.
export const F7 = defineRule({
  id: 'F7',
  group: 'F',
  severity: 'high',
  title: 'Two subscriptions live for one user with no link between them',
  detects:
    'Two subscription tokens granted to the same user, both read as live, where neither names the other as its linked purchase token and the earlier one was never revoked. A replacement launched without the token it replaces produces exactly this.',
  run(tl) {
    // Every token this timeline shows as a live subscription, with its grant.
    const live: Array<{ token: string; grant: LedgerEv; read: ApiEv }> = [];
    for (const [token, events] of tl.byToken) {
      const read = [...events].reverse().find((e): e is ApiEv => isOkGet(e) && e.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE');
      if (!read) continue;
      const grant = events.find((e): e is LedgerEv => isGrant(e));
      if (!grant) continue;
      if (events.some((e) => isRevoke(e) && precedes(grant, e))) continue;
      live.push({ token, grant, read });
    }
    const hits = [];
    for (let n = 1; n < live.length; n += 1) {
      const first = live[n - 1];
      const second = live[n];
      if (first.grant.userId !== second.grant.userId) continue;
      // A replacement says so on the resource; these do not.
      const linked = [first.read, second.read].some(
        (r) => r.linkedPurchaseToken === first.token || r.linkedPurchaseToken === second.token,
      );
      if (linked) continue;
      const products = [first.read, second.read]
        .flatMap((r) => (r.lineItems ?? []).map((item) => item.productId))
        .filter((id): id is string => typeof id === 'string');
      if (products.some((id) => productTypeOf(tl, id) !== 'subscription')) continue;
      hits.push({
        evidence: [first.grant.i, second.grant.i],
        confidence: 'likely' as const,
        mechanism: `${first.token} and ${second.token} are both live subscriptions granted to ${first.grant.userId ?? 'the same user'} (#${first.grant.i} and #${second.grant.i}), neither names the other as a linked purchase token, and the earlier one was never revoked. The user is being charged for both.`,
        nextCheck: `Check the Play Console for this user: two orders renewing means two charges. Launch a plan change with the token of the subscription it replaces, not as a fresh purchase, and check the new resource carries linkedPurchaseToken before granting. Then refund the duplicate and revoke it, which is G5 and G7.`,
      });
      break;
    }
    return hits;
  },
});
