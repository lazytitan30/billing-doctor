import { defineRule } from '../rule.js';
import { failedWith, howKnown, saysAlreadyConnecting, saysStaleDetails } from './deviceCodes.js';

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
      // Two wordings mean something else entirely, and each has its own rule.
      if (saysAlreadyConnecting(e)) continue;
      if (saysStaleDetails(e)) continue;
      hits.push({
        evidence: [e.i],
        confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
        mechanism: `${e.kind === 'app' ? e.type : 'a billing call'} at #${e.i} failed with DEVELOPER_ERROR (${howKnown(outcome)}). Nothing about the user or the network changes this.`,
        nextCheck: `Read the debug message the library returned; it names the argument. The usual causes: an empty or wrong product list, a product id that does not match the Console, a missing offer token on a subscription, acknowledging or consuming a purchase that is still PENDING, acknowledging twice, and pending purchases not enabled when the library requires it. Three more are easy to miss: a plan change against a subscription Google still holds as unacknowledged, which it blocks (B11); a build whose version code Play has never seen, so the running binary is not the one the Console knows; and a replacement built with an API the current library deprecated, which rejects some replacement modes and accepts others.`,
      });
    }
    return hits;
  },
});
