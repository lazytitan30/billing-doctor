import { defineRule } from '../rule.js';
import { SEC_MS, isApp, isPurchaseResult, type Ev } from '../helpers.js';
import { isConnected } from './deviceCodes.js';

const SAME_EVENT_MS = 3 * SEC_MS;

// Two clients, two callbacks for one purchase. Whatever the callback does, it
// happens twice.
export const K9 = defineRule({
  id: 'K9',
  group: 'K',
  severity: 'medium',
  title: 'More than one billing client, so one purchase arrives twice',
  detects:
    'Two purchase results for the same token within three seconds, or a second successful billing_connected in the same app session with no disconnection between them. Google recommends one active connection precisely to avoid duplicate callbacks.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const results = events.filter(isPurchaseResult);
      for (let n = 1; n < results.length; n += 1) {
        if (results[n].tMs - results[n - 1].tMs > SAME_EVENT_MS) continue;
        hits.push({
          evidence: [results[n - 1].i, results[n].i],
          confidence: 'likely' as const,
          mechanism: `${token} was reported to the app twice within ${Math.round((results[n].tMs - results[n - 1].tMs) / 1000)} seconds, at #${results[n - 1].i} and #${results[n].i}. That is one purchase delivered to two listeners.`,
          nextCheck: `Keep one BillingClient for the process and one listener on it. Then make the verify path idempotent on the token anyway, so a duplicate callback costs an API call and nothing else. See B7 for what a second grant does.`,
        });
        break;
      }
    }
    // A second connection counts only inside one process: an app_start is a
    // new process with a client of its own, and an attempt that failed opened
    // nothing, so a retry after it is not a second client. Both shapes fired
    // this rule on the 2026-09-13 sample, seven times for one true case.
    let open: Ev | undefined;
    for (const e of tl.events) {
      if (!isApp(e)) continue;
      if (e.type === 'app_start' || e.type === 'connection_lost') {
        open = undefined;
        continue;
      }
      if (!isConnected(e)) continue;
      if (open) {
        hits.push({
          evidence: [open.i, e.i],
          confidence: 'possible' as const,
          mechanism: `The app reported a billing connection at #${open.i} and again at #${e.i} in the same session, with no disconnection recorded in between, which suggests a second client.`,
          nextCheck: `Confirm how many BillingClient instances the app builds. One per process, held for its lifetime, is the shape to aim for.`,
        });
        break;
      }
      open = e;
    }
    return hits;
  },
});
