import { defineRule } from '../rule.js';
import { isApp } from '../helpers.js';

// The catalogue came back empty. The single most reported Play Billing problem.
export const K1 = defineRule({
  id: 'K1',
  group: 'K',
  severity: 'high',
  title: 'Product query returned nothing for a non-empty request',
  detects:
    'A query_products event that asked for one or more product ids and got none back. The app has no prices to show, so nothing can be bought, and the causes are all outside the code.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      if (!isApp(e) || e.type !== 'query_products') continue;
      if (!e.requested || e.returned === undefined || e.returned > 0) continue;
      hits.push({
        evidence: [e.i],
        confidence: 'certain' as const,
        mechanism: `The device asked for ${e.requested} product id${e.requested === 1 ? '' : 's'} at #${e.i} and Google returned none. The store cannot price anything, so no purchase is possible.`,
        nextCheck: `Work down the list: the installed build must be the one Play has (same application id, no debug suffix, signed with the same key, on a track); the products and their base plans must be Active in the Console; the ids in the code must match the Console exactly; the user's country must be in the product's availability. A recent Console change can take hours. Clearing the Play Store app's data on the test device clears a stale catalogue cache.`,
      });
    }
    return hits;
  },
});
