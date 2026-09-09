import { defineRule } from '../rule.js';
import { MIN_MS, isApp, precedes } from '../helpers.js';

// queryPurchasesAsync on launch and resume is how purchases made elsewhere,
// or completed while the app was closed, reach the app.
export const H4 = defineRule({
  id: 'H4',
  group: 'H',
  severity: 'medium',
  title: 'No queryPurchasesAsync after app start or resume',
  detects:
    'An app_start or app_resume event with no query_purchases event within a minute after it. Google says to call queryPurchasesAsync on connection and in onResume so purchases made on another device, or completed while the app was closed, are processed.',
  run(tl) {
    const hits = [];
    for (const start of tl.events.filter((e) => isApp(e) && (e.type === 'app_start' || e.type === 'app_resume'))) {
      const queried = tl.events.some((e) => isApp(e) && e.type === 'query_purchases' && precedes(start, e) && e.tMs <= start.tMs + MIN_MS);
      if (queried) continue;
      hits.push({
        evidence: [start.i],
        confidence: 'likely' as const,
        mechanism: `The app ${isApp(start) && start.type === 'app_start' ? 'started' : 'resumed'} at #${start.i} and no queryPurchasesAsync followed within a minute.`,
        nextCheck: `Confirm in the client code that queryPurchasesAsync runs in onBillingSetupFinished and in onResume, and that its results go through the same verify path as a fresh purchase.`,
      });
      if (hits.length === 3) break;
    }
    return hits;
  },
});
