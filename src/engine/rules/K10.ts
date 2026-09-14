import { defineRule } from '../rule.js';
import { hasServerView, isApi, isApp, isLedger, iso, type AppEv, type Ev } from '../helpers.js';

const MAX_EVIDENCE = 5;

// The device holds a completed purchase: the listener reported it, or a later
// query returned it, which is the same fact reached by a different road.
function holds(e: Ev): e is AppEv {
  return isApp(e) && (e.type === 'purchase_result' || e.type === 'query_purchases') && e.purchaseState === 'PURCHASED';
}

// The user paid and the backend never heard about it. The worst finding in the
// catalogue, because nothing in the backend can notice it on its own.
export const K10 = defineRule({
  id: 'K10',
  group: 'K',
  severity: 'high',
  title: 'A purchase the device completed that never reached the server',
  detects:
    'A PURCHASED purchase on the device, reported by the listener or returned by a later query, whose token appears in no API call and no ledger write anywhere in the timeline. The money moved and the backend has no record of it at all.',
  run(tl) {
    const unseen: Array<{ token: string; held: AppEv }> = [];
    for (const [token, events] of tl.byToken) {
      const held = events.find(holds);
      if (!held) continue;
      if (events.some((e) => isApi(e) || isLedger(e))) continue;
      unseen.push({ token, held });
    }
    if (unseen.length === 0) return [];
    if (hasServerView(tl)) {
      return unseen.map(({ token, held }) => ({
        evidence: [held.i],
        confidence: 'certain' as const,
        mechanism: `${token} was ${held.type === 'purchase_result' ? 'purchased on the device' : 'returned by the device query as PURCHASED'} at ${iso(held.tMs)} (#${held.i}). No call to Google and no ledger write mentions it anywhere in this timeline, so the backend never saw the purchase.`,
        nextCheck: `Verify this token now and grant what the user paid for. Then close the hole: call queryPurchasesAsync on every connection and on resume and send everything it returns through the verify endpoint, and run a reconciliation that compares Google's view against your ledger so the next one is found by a job rather than by the customer.`,
      }));
    }
    // A timeline with nothing from the server cannot show whether the server
    // saw anything. On the 2026-09-13 sample this fired at full strength on
    // every purchase in twelve client-only reports; one finding says what the
    // file can and cannot show, and the backend's events settle it.
    const shown = unseen.slice(0, MAX_EVIDENCE);
    const tokens = `${shown.map((u) => u.token).join(', ')}${unseen.length > shown.length ? ', …' : ''}`;
    const one = unseen.length === 1;
    return [
      {
        evidence: shown.map((u) => u.held.i),
        confidence: 'possible' as const,
        severity: 'medium' as const,
        mechanism: `${one ? `${tokens} was` : `${unseen.length} purchases (${tokens}) were`} completed on the device, and this timeline carries no API call and no ledger write at all, so nothing in it can show whether the backend ever saw ${one ? 'it' : 'them'}.`,
        nextCheck: `Add the backend's side for ${one ? 'this token' : 'these tokens'}: the calls it made to Google and the rows it wrote, as api and ledger events. If it has neither, the purchase never reached it: verify the token now, grant what the user paid for, and close the hole with queryPurchasesAsync on every connection and resume feeding the verify endpoint.`,
      },
    ];
  },
});
