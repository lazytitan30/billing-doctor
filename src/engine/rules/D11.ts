import { defineRule } from '../rule.js';
import { DAY_MS, expiryOf, isApi, isOk, iso, type ApiEv } from '../helpers.js';

const VALID_FOR_MS = 60 * DAY_MS;

// A purchase token stops working sixty days after the subscription expired.
export const D11 = defineRule({
  id: 'D11',
  group: 'D',
  severity: 'medium',
  title: 'Purchase token used more than sixty days after expiry',
  detects:
    'A call to the Developer API for a token whose known expiry is more than sixty days earlier, or that answered 410. After that window the token no longer resolves and the answer is not a statement about entitlement.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      let expiry: number | undefined;
      let expiryAt: number | undefined;
      for (const e of events) {
        if (!isApi(e)) continue;
        // A plain alias, so that reading the answer does not narrow the call away.
        const call: ApiEv = e;
        const read = call.call.endsWith('.get');
        if (read && isOk(call.status)) {
          const answered = expiryOf(call);
          if (answered !== undefined) {
            expiry = answered;
            expiryAt = call.i;
          }
          continue;
        }
        const gone = call.status === 410;
        const tooOld = read && expiry !== undefined && call.tMs > expiry + VALID_FOR_MS;
        if (!gone && !tooOld) continue;
        hits.push({
          evidence: expiryAt !== undefined ? [expiryAt, call.i] : [call.i],
          confidence: gone ? ('certain' as const) : ('likely' as const),
          mechanism: `${token} expired ${expiry !== undefined ? `at ${iso(expiry)}` : 'before this call'} and was queried at #${call.i}${gone ? ', which answered 410' : `, ${Math.round((call.tMs - (expiry as number)) / DAY_MS)} days later`}. Past sixty days the token is no longer valid for the Developer API.`,
          nextCheck: `Do not treat this answer as "no entitlement". Store the subscription's state and expiry when you first verify it, and read your own record afterwards. Purge the raw token once it can no longer be exchanged for anything, which is what J2 is about.`,
        });
        break;
      }
    }
    return hits;
  },
});
