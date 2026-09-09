import { defineRule } from '../rule.js';
import { isGrant } from '../helpers.js';

// Every double grant in the founder's history came from a grant with no key.
export const J1 = defineRule({
  id: 'J1',
  group: 'J',
  severity: 'medium',
  title: 'Grant without an idempotency key',
  detects:
    'A ledger grant with no idempotencyKey. At-least-once delivery and client retries both present the same purchase twice; the key on the grant is what makes the second presentation harmless.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const grant = events.find((e) => isGrant(e) && !e.idempotencyKey);
      if (!grant) continue;
      hits.push({
        evidence: [grant.i],
        confidence: 'certain' as const,
        mechanism: `The grant for ${token} at #${grant.i} carries no idempotency key, so a retry of the same purchase or notification grants again.`,
        nextCheck: `Key the grant on the purchase token (and the Pub/Sub messageId for notification-driven writes) with a unique constraint; on a conflict, skip the grant and retry only the acknowledgement.`,
      });
    }
    return hits;
  },
});
