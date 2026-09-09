import { defineRule } from '../rule.js';
import { expiryOf, isLedger, isOkGet, isPurchaseResult, iso, precedes } from '../helpers.js';

// A time-prorated replacement moves the next billing date; the expiry must be
// re-read from the new token's resource.
export const F4 = defineRule({
  id: 'F4',
  group: 'F',
  severity: 'medium',
  title: 'Expiry not re-read after a replacement with time proration',
  detects:
    'A purchase with a replacement mode, and a ledger expiry for the new token carried over from the previous token or differing from the new resource\'s expiryTime. Proration pushes the next billing date forward.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const purchase = events.find((e) => isPurchaseResult(e) && e.replacementMode !== undefined);
      if (!purchase || !isPurchaseResult(purchase)) continue;
      const read = events.find((e) => isOkGet(e) && precedes(purchase, e));
      const answered = read && isOkGet(read) ? expiryOf(read) : undefined;
      for (const e of events) {
        if (!isLedger(e) || !precedes(purchase, e)) continue;
        if (e.expirySource === 'previous_token') {
          hits.push({
            evidence: read ? [purchase.i, read.i, e.i] : [purchase.i, e.i],
            confidence: 'certain' as const,
            mechanism: `${token} replaced ${purchase.oldToken ?? 'another token'} with ${purchase.replacementMode} (#${purchase.i}); the ledger carried the previous token's expiry over at #${e.i}${answered !== undefined ? ` while the new resource answers ${iso(answered)}` : ''}.`,
            nextCheck: `Store lineItems[].expiryTime from the new token's resource; the prorated credit moved the billing date.`,
          });
          break;
        }
        if (e.expirySource === undefined && e.expiry !== undefined && answered !== undefined && Math.abs(Date.parse(e.expiry) - answered) > 60_000) {
          hits.push({
            evidence: [purchase.i, read!.i, e.i],
            confidence: 'likely' as const,
            mechanism: `${token} is a ${purchase.replacementMode} replacement (#${purchase.i}); its resource answers expiryTime ${iso(answered)} at #${read!.i} and the ledger stored ${e.expiry} at #${e.i}.`,
            nextCheck: `Compare the ledger row with the resource and store the fetched expiryTime after every replacement.`,
          });
          break;
        }
      }
    }
    return hits;
  },
});
