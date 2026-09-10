import { defineRule } from '../rule.js';
import { isApp, precedes } from '../helpers.js';
import { failedWith, howKnown } from './deviceCodes.js';

const NEEDS_CONNECTION = new Set(['query_products', 'query_purchases', 'launch_billing_flow', 'acknowledge', 'consume']);

// A billing call made while the client was not connected. The connection also
// drops on its own when the Play Store updates itself in the background.
export const K2 = defineRule({
  id: 'K2',
  group: 'K',
  severity: 'medium',
  title: 'Billing call made while the client was disconnected',
  detects:
    'A device call that failed with SERVICE_DISCONNECTED, or a call made before the first billing_connected event in the timeline. The library can reconnect on its own if that is switched on.',
  run(tl) {
    const hits = [];
    const connected = tl.events.find((e) => isApp(e) && e.type === 'billing_connected');
    for (const e of tl.events) {
      if (!isApp(e)) continue;
      const outcome = failedWith(e, -1);
      if (outcome) {
        hits.push({
          evidence: [e.i],
          confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
          mechanism: `${e.type} at #${e.i} failed because the client was not connected to Play (${howKnown(outcome)}).`,
          nextCheck: `Enable automatic service reconnection when building the BillingClient, gate every call on the client being ready, and reconnect with backoff from onBillingServiceDisconnected. Expect the connection to drop by itself when the Play Store updates.`,
        });
        continue;
      }
      if (connected && NEEDS_CONNECTION.has(e.type) && precedes(e, connected)) {
        hits.push({
          evidence: [e.i, connected.i],
          confidence: 'likely' as const,
          mechanism: `${e.type} ran at #${e.i}, before the client reported a connection at #${connected.i}. The first catalogue query after launch is the classic case, and it comes back empty or throws.`,
          nextCheck: `Wait for the connection callback before the first call, or await a readiness promise the whole app shares. Retry the first query once with a short delay: a cold start can take several seconds.`,
        });
      }
    }
    return hits;
  },
});
