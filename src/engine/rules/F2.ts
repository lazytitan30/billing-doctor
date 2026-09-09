import { defineRule } from '../rule.js';
import { expiryOf, isGrant, isOkGet, isPurchaseResult, iso, precedes, tokenEvents } from '../helpers.js';

// A DEFERRED replacement takes effect at the next renewal; the new token is
// surfaced immediately, which is the trap.
export const F2 = defineRule({
  id: 'F2',
  group: 'F',
  severity: 'medium',
  title: 'DEFERRED replacement granted the new tier before the renewal',
  detects:
    'A purchase with replacementMode DEFERRED, and a ledger grant for the new token before the old item\'s expiry. The new purchase token is surfaced at once, but the new tier starts when the existing item expires.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const purchase = events.find((e) => isPurchaseResult(e) && e.replacementMode === 'DEFERRED');
      if (!purchase || !isPurchaseResult(purchase)) continue;
      const oldRead = purchase.oldToken ? [...tokenEvents(tl, purchase.oldToken)].reverse().find(isOkGet) : undefined;
      const newRead = events.find((e) => isOkGet(e) && precedes(purchase, e));
      let switchMs: number | undefined = oldRead ? expiryOf(oldRead) : undefined;
      if (switchMs === undefined && newRead && isOkGet(newRead) && newRead.lineItems && newRead.lineItems.length > 0) {
        const times = newRead.lineItems.map((i) => (i.expiryTime ? Date.parse(i.expiryTime) : NaN)).filter((n) => Number.isFinite(n));
        if (times.length) switchMs = Math.min(...times);
      }
      if (switchMs === undefined) continue;
      const grant = events.find((e) => isGrant(e) && precedes(purchase, e) && e.tMs < switchMs!);
      if (!grant) continue;
      hits.push({
        evidence: [purchase.i, grant.i],
        confidence: 'certain' as const,
        mechanism: `${token} is a DEFERRED replacement (#${purchase.i}); the ledger granted its tier at #${grant.i}, before the existing item expires at ${iso(switchMs)}.`,
        nextCheck: `Keep the old tier until ${iso(switchMs)}; grant the new one on the renewal notification after a fetch shows the new item active. Read lineItems[].deferredItemReplacement on the resource.`,
      });
    }
    return hits;
  },
});
