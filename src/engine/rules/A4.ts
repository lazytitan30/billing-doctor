import { defineRule } from '../rule.js';
import { isRtdn, precedes, type RtdnEv } from '../helpers.js';

const ACK_STATUSES = new Set([102, 200, 201, 202, 204]);

// Any status outside Pub/Sub's acknowledgement set is a negative ack: the
// message comes back.
export const A4 = defineRule({
  id: 'A4',
  group: 'A',
  severity: 'medium',
  title: 'Endpoint answered a status Pub/Sub does not treat as acknowledged, and the message came back',
  detects:
    'A notification answered with a status outside 102, 200, 201, 202 and 204, followed by a delivery with the same messageId. Pub/Sub resends until the endpoint answers one of those.',
  run(tl) {
    const hits = [];
    const seen = new Set<string>();
    for (const first of tl.events.filter((e): e is RtdnEv => isRtdn(e) && Boolean(e.messageId) && e.endpointStatus !== undefined && !ACK_STATUSES.has(e.endpointStatus))) {
      if (seen.has(first.messageId!)) continue;
      const again = tl.events.find((e) => isRtdn(e) && e.messageId === first.messageId && precedes(first, e));
      if (!again) continue;
      seen.add(first.messageId!);
      hits.push({
        evidence: [first.i, again.i],
        confidence: 'certain' as const,
        mechanism: `${first.messageId} was answered ${first.endpointStatus} at #${first.i} and delivered again at #${again.i}. A body the handler cannot use is still acknowledged with 200; only a failure the handler wants retried answers 5xx.`,
        nextCheck: `Decide per branch: undecodable body, missing messageId, unknown token answer 200 and log; a database or API failure answers 500 after rolling back the messageId claim, so the retry re-runs cleanly.`,
      });
    }
    return hits;
  },
});
