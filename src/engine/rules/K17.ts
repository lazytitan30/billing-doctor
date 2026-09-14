import { defineRule } from '../rule.js';
import { isApp, precedes } from '../helpers.js';
import { STALE_DETAILS_MS, failedWith, howKnown } from './deviceCodes.js';

// Play refused to sell. The reasons are in the Console, not in the code, and
// retrying in code does not change any of them.
export const K17 = defineRule({
  id: 'K17',
  group: 'K',
  severity: 'high',
  title: 'ITEM_UNAVAILABLE at purchase time',
  detects:
    "A device call, usually the purchase flow, that failed with ITEM_UNAVAILABLE. Google refuses the sale when the product is not active, the app is not published, or the app is not available in the user's country, and it goes on refusing a correct configuration for a while after a change.",
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      if (!isApp(e)) continue;
      // An empty catalogue answers with this code too, and K1 owns that.
      if (e.type === 'query_products' && e.returned === 0) continue;
      const outcome = failedWith(e, 4);
      if (!outcome) continue;
      // A flow launched from a catalogue older than six hours fails with this
      // code too, and that is K8's: the details went stale, not the product.
      if (e.type === 'launch_billing_flow') {
        const queries = tl.events.filter((q) => isApp(q) && q.type === 'query_products' && precedes(q, e));
        const last = queries[queries.length - 1];
        if (last && e.tMs - last.tMs >= STALE_DETAILS_MS) continue;
      }
      hits.push({
        evidence: [e.i],
        confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
        mechanism: `${e.type}${e.productId ? ` for ${e.productId}` : ''} failed with ITEM_UNAVAILABLE at #${e.i} (${howKnown(outcome)}). Play refused to sell it to this user on this device.`,
        nextCheck: `Work down Google's list for this product and this user: the product and its base plan are Active; the app is published on a track this account can see; the app is available in the user's country (check the production track's country list even when only a testing track is live: for one reporter in the 2026-09-13 sample the closed track's list alone was not enough); the installed build is the one Play has, same application id and signing key. If all of that is right and the product or its availability changed in the last day or two, wait: Google says the details take time to propagate, particularly during testing. Retrying in code does not help.`,
      });
      if (hits.length === 3) break;
    }
    return hits;
  },
});
