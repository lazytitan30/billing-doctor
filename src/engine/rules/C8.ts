import { defineRule } from '../rule.js';
import { isLedgerWrite, isRtdn } from '../helpers.js';

const ACK_STATUSES = new Set([102, 200, 201, 202, 204]);

// A notification that was never acknowledged and never applied. Pub/Sub keeps
// redelivering it, and the change it carried never lands.
export const C8 = defineRule({
  id: 'C8',
  group: 'C',
  severity: 'high',
  title: 'A notification never acknowledged and never applied',
  detects:
    'A notification answered with a status Pub/Sub does not accept, whose messageId drives no ledger write anywhere in the timeline. The state change it carried was lost, and the message keeps coming back until it expires.',
  run(tl) {
    const seen = new Set<string>();
    const hits = [];
    for (const e of tl.events) {
      if (!isRtdn(e) || !e.messageId || seen.has(e.messageId)) continue;
      if (e.endpointStatus === undefined || ACK_STATUSES.has(e.endpointStatus)) continue;
      const applied = tl.events.some((w) => isLedgerWrite(w) && w.messageId === e.messageId);
      if (applied) continue;
      seen.add(e.messageId);
      const deliveries = tl.events.filter((d) => isRtdn(d) && d.messageId === e.messageId);
      hits.push({
        evidence: deliveries.map((d) => d.i),
        confidence: 'certain' as const,
        mechanism: `${e.messageId} was answered ${e.endpointStatus} ${deliveries.length === 1 ? 'once' : `on all ${deliveries.length} deliveries`} and no ledger write carries that id. Pub/Sub keeps the message and redelivers it until the subscription's retention runs out, while whatever it announced was never applied.`,
        nextCheck: `Find out why the handler fails on this message: a shape it does not expect, a null it does not guard, a token it cannot resolve. Then decide per branch. Anything that will still be wrong on the retry answers 200 and is logged. Anything that should re-run answers 5xx after rolling back. Alert when a messageId is delivered more than a few times: that is a refund or a state change stuck in a loop.`,
      });
    }
    return hits;
  },
});
