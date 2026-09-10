import { defineRule } from '../rule.js';
import { MIN_MS, isApp, isLedger, precedes } from '../helpers.js';
import { howKnown, outcomeOf } from './deviceCodes.js';

const WINDOW_MS = 2 * MIN_MS;

// The money path failed and the app said it worked.
export const K13 = defineRule({
  id: 'K13',
  group: 'K',
  severity: 'medium',
  title: 'A failed purchase reported to the user as a success',
  detects:
    'A device billing call that failed for a reason other than the user cancelling, followed within two minutes by a client response of success. A purchase path that fails quietly is worse than one that fails loudly.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      if (!isApp(e)) continue;
      const outcome = outcomeOf(e);
      if (!outcome || outcome.code === 0 || outcome.code === 1) continue;
      const told = tl.events.find(
        (r) => isLedger(r) && r.op === 'client_response' && r.result === 'success' && precedes(e, r) && r.tMs <= e.tMs + WINDOW_MS,
      );
      if (!told) continue;
      hits.push({
        evidence: [e.i, told.i],
        confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
        mechanism: `${e.type} failed with ${outcome.name} at #${e.i} (${howKnown(outcome)}), and success was reported at #${told.i}. Nothing was bought and the user was told otherwise.`,
        nextCheck: `Make the purchase path fail loudly: no swallowed exception, no web or fallback stub that resolves with nothing where purchases are impossible, and no success response unless a verified grant was written. Check what the app does when it runs outside the store, in a browser or on a device with no Play Store.`,
      });
    }
    return hits;
  },
});
