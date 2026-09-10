import { defineRule } from '../rule.js';
import { MIN_MS, isApp, precedes } from '../helpers.js';
import { failedWith, howKnown } from './deviceCodes.js';

const WINDOW_MS = 5 * MIN_MS;

// Already owned: the user cannot buy because something earlier was never
// finished. Google's instruction is to look, not to retry blindly.
export const K3 = defineRule({
  id: 'K3',
  group: 'K',
  severity: 'high',
  title: 'Purchase refused as already owned, and nothing looked for the old purchase',
  detects:
    'A device call that failed with ITEM_ALREADY_OWNED and no queryPurchasesAsync within five minutes afterwards. The user is blocked by a purchase that was never consumed or never acknowledged.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      const outcome = failedWith(e, 7);
      if (!outcome) continue;
      const looked = tl.events.some(
        (q) => isApp(q) && q.type === 'query_purchases' && precedes(e, q) && q.tMs <= e.tMs + WINDOW_MS,
      );
      if (looked) continue;
      hits.push({
        evidence: [e.i],
        confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
        mechanism: `The purchase at #${e.i} was refused because the item is already owned (${howKnown(outcome)}), and no query of existing purchases followed. Whatever the user already owns is unconsumed or unacknowledged, so the shop is stuck and, if it is unacknowledged, Google will refund it.`,
        nextCheck: `Call queryPurchasesAsync now and finish what comes back: consume a consumable, acknowledge anything else, and send it to the verify endpoint. Then do that on every connection and resume so it never builds up. See B5 for consumables acknowledged instead of consumed.`,
      });
    }
    return hits;
  },
});
