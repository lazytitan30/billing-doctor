import { defineRule } from '../rule.js';
import { isGrant, isOkGet, precedes } from '../helpers.js';

// Access granted before the backend ever asked Google about the token.
export const B6 = defineRule({
  id: 'B6',
  group: 'B',
  severity: 'high',
  title: 'Entitlement granted before any verification with Google',
  detects:
    'A ledger grant for a token with no successful purchases.*.get before it. A grant on the client\'s word alone is a grant to anyone who can call the endpoint.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const grant = events.find(isGrant);
      if (!grant) continue;
      if (events.some((e) => isOkGet(e) && precedes(e, grant))) continue;
      const laterGet = events.find((e) => isOkGet(e) && precedes(grant, e));
      hits.push({
        evidence: laterGet ? [grant.i, laterGet.i] : [grant.i],
        confidence: 'certain' as const,
        mechanism: `${token} was granted at #${grant.i} with no purchases.*.get answered 2xx before it${laterGet ? `; the first verification came later, at #${laterGet.i}` : ''}. The grant rested on what the device sent.`,
        nextCheck: `Confirm the verify endpoint calls purchases.subscriptionsv2.get or purchases.productsv2.get before writing the grant, and grants only on the API's state.`,
      });
    }
    return hits;
  },
});
