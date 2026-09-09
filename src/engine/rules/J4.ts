import { defineRule } from '../rule.js';
import { isLedger } from '../helpers.js';

const HAS_ZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/;

// Google's expiry is UTC. A local clock is off by the offset at every boundary.
export const J4 = defineRule({
  id: 'J4',
  group: 'J',
  severity: 'medium',
  title: 'Expiry compared or stored in local time',
  detects:
    'A ledger event marked timezone local, or a stored expiry with no Z or offset. expiryTime is RFC 3339 UTC; a local-time comparison is wrong by the offset around every renewal.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const e = events.find((x) => isLedger(x) && (x.timezone === 'local' || (typeof x.expiry === 'string' && !HAS_ZONE_RE.test(x.expiry))));
      if (!e || !isLedger(e)) continue;
      hits.push({
        evidence: [e.i],
        confidence: 'certain' as const,
        mechanism: `The ledger ${e.op} for ${token} at #${e.i} ${e.timezone === 'local' ? 'used the local clock' : `stored the expiry as "${e.expiry}", with no timezone`}. Google's expiryTime is UTC.`,
        nextCheck: `Store expiry as a timestamp with time zone (or epoch milliseconds) and compare against Date.now() in UTC; check the database column type and the server's TZ setting.`,
      });
    }
    return hits;
  },
});
