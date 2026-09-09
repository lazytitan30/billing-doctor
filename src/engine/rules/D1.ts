import { defineRule } from '../rule.js';
import { expiryOf, isLedger, isOkGet, isPurchaseResult, iso, precedes, type ApiEv } from '../helpers.js';

const WRONG_SOURCES = new Set(['eventTimeMillis', 'clock', 'plan_length']);

// The stored expiry came from the notification time, the clock or the plan
// length instead of lineItems[].expiryTime.
export const D1 = defineRule({
  id: 'D1',
  group: 'D',
  severity: 'high',
  title: 'Expiry taken from the notification time or the clock, not from expiryTime',
  detects:
    'A ledger expiry whose declared source is eventTimeMillis, the clock or the plan length, or a stored expiry that differs from the last expiryTime Google answered for the token. The access window is expiryTime; the notification time is when the event happened.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      // Replacements are F4's business: their expiry moves by proration.
      if (events.some((e) => isPurchaseResult(e) && e.replacementMode)) continue;
      for (const e of events) {
        if (!isLedger(e)) continue;
        const lastGet = [...events].reverse().find((g): g is ApiEv => isOkGet(g) && precedes(g, e));
        if (e.expirySource && WRONG_SOURCES.has(e.expirySource)) {
          hits.push({
            evidence: lastGet ? [lastGet.i, e.i] : [e.i],
            confidence: 'certain' as const,
            mechanism: `The ledger stored the expiry for ${token} from ${e.expirySource} at #${e.i}${lastGet && expiryOf(lastGet) !== undefined ? `, while the resource read at #${lastGet.i} carried expiryTime ${iso(expiryOf(lastGet)!)}` : ''}.`,
            nextCheck: `Compare the stored expiry with lineItems[].expiryTime from purchases.subscriptionsv2.get for ${token}, and store that value on every fetch.`,
          });
          continue;
        }
        if (e.expirySource || !e.expiry || !lastGet) continue;
        const stored = Date.parse(e.expiry);
        const answered = expiryOf(lastGet);
        if (!Number.isFinite(stored) || answered === undefined) continue;
        if (Math.abs(stored - answered) <= 60_000) continue;
        hits.push({
          evidence: [lastGet.i, e.i],
          confidence: 'likely' as const,
          mechanism: `Google answered expiryTime ${iso(answered)} for ${token} at #${lastGet.i}; the ledger stored ${e.expiry} at #${e.i}. The stored value did not come from the resource.`,
          nextCheck: `Find where the ledger's expiry is computed. If it adds a period to the notification time or to now, replace it with lineItems[].expiryTime from the fetched resource.`,
        });
      }
    }
    return hits;
  },
});
