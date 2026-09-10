import { defineRule } from '../rule.js';
import { SEC_MS, isApp, isPurchaseResult, precedes } from '../helpers.js';

const SAME_EVENT_MS = 3 * SEC_MS;

// Two clients, two callbacks for one purchase. Whatever the callback does, it
// happens twice.
export const K9 = defineRule({
  id: 'K9',
  group: 'K',
  severity: 'medium',
  title: 'More than one billing client, so one purchase arrives twice',
  detects:
    'Two purchase results for the same token within three seconds, or a second billing_connected with no disconnection in between. Google recommends one active connection precisely to avoid duplicate callbacks.',
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
    const connections = tl.events.filter((e) => isApp(e) && e.type === 'billing_connected');
    for (let n = 1; n < connections.length; n += 1) {
      const lost = tl.events.some(
        (e) => isApp(e) && e.type === 'connection_lost' && precedes(connections[n - 1], e) && precedes(e, connections[n]),
      );
      if (lost) continue;
      hits.push({
        evidence: [connections[n - 1].i, connections[n].i],
        confidence: 'possible' as const,
        mechanism: `The app reported a billing connection at #${connections[n - 1].i} and again at #${connections[n].i} with no disconnection recorded in between, which suggests a second client.`,
        nextCheck: `Confirm how many BillingClient instances the app builds. One per process, held for its lifetime, is the shape to aim for.`,
      });
      break;
    }
    return hits;
  },
});
