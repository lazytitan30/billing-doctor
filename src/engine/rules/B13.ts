import { defineRule } from '../rule.js';
import { HOUR_MS, isApi, isApp, isOkGet, isPurchaseResult, precedes } from '../helpers.js';

const WATCH_FOR_MS = 6 * HOUR_MS;

// A pending purchase nobody followed. The clock starts when it completes, and
// by then the screen that would have noticed is long gone.
export const B13 = defineRule({
  id: 'B13',
  group: 'B',
  severity: 'high',
  title: 'Pending purchase never followed to its conclusion',
  detects:
    'A purchase reported as PENDING with nothing in the timeline showing what became of it. The three-day acknowledgement window opens when it turns PURCHASED, so an app that only watches while the shop screen is open misses the window entirely.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const pending = events.find((e) => isPurchaseResult(e) && e.purchaseState === 'PENDING');
      if (!pending) continue;
      // Anything that shows somebody kept watching this token.
      const followed = events.some((e) => {
        if (!precedes(pending, e)) return false;
        if (isPurchaseResult(e) && e.purchaseState === 'PURCHASED') return true;
        if (isApp(e) && (e.type === 'acknowledge' || e.type === 'consume')) return true;
        if (isOkGet(e) && e.purchaseState === 'PURCHASED') return true;
        return isApi(e) && /\.(acknowledge|consume)$/.test(e.call);
      });
      if (followed) continue;
      if (tl.endMs - pending.tMs < WATCH_FOR_MS) continue;
      hits.push({
        evidence: [pending.i],
        confidence: 'likely' as const,
        mechanism: `${token} was reported PENDING at #${pending.i} and nothing in this timeline shows what happened next: no PURCHASED result, no read of the resource, no acknowledgement. If the user completed the payment later, the three-day window opened then and nobody was watching.`,
        nextCheck: `Handle the transition where it cannot be missed. Enable one-time product notifications and act on the notification, or call queryPurchasesAsync on every connection and on every resume and finish whatever comes back. Tell the user the payment is still pending rather than leaving the screen looking like a failure, which is what sends them away before it completes.`,
      });
    }
    return hits;
  },
});
