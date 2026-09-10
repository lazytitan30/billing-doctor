import { defineRule } from '../rule.js';
import { failedWith, howKnown } from './deviceCodes.js';

// The API was used incorrectly. Retrying cannot fix it and hides it.
export const K6 = defineRule({
  id: 'K6',
  group: 'K',
  severity: 'high',
  title: 'DEVELOPER_ERROR from a billing call',
  detects:
    'A device call that failed with DEVELOPER_ERROR. Google lists it as not recoverable: the arguments or the app configuration are wrong, and every attempt will fail the same way.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      const outcome = failedWith(e, 5);
      if (!outcome) continue;
      hits.push({
        evidence: [e.i],
        confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
        mechanism: `${e.kind === 'app' ? e.type : 'a billing call'} at #${e.i} failed with DEVELOPER_ERROR (${howKnown(outcome)}). Nothing about the user or the network changes this.`,
        nextCheck: `Read the debug message the library returned; it names the argument. The usual causes: an empty or wrong product list, a product id that does not match the Console, a missing offer token on a subscription, acknowledging or consuming a purchase that is still PENDING, acknowledging twice, an unsigned build, or pending purchases not enabled when the library requires it.`,
      });
    }
    return hits;
  },
});
