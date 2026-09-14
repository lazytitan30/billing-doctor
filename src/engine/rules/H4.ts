import { defineRule } from '../rule.js';
import { MIN_MS, isApp, precedes, type AppEv } from '../helpers.js';

const MAX_EVIDENCE = 5;

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
    const unqueried: AppEv[] = [];
    for (const start of tl.events) {
      if (!isApp(start) || (start.type !== 'app_start' && start.type !== 'app_resume')) continue;
      const queried = tl.events.some((e) => isApp(e) && e.type === 'query_purchases' && precedes(start, e) && e.tMs <= start.tMs + MIN_MS);
      if (!queried) unqueried.push(start);
    }
    if (unqueried.length === 0) return [];
    // One finding for the timeline, however many starts: the fix is the same
    // line of code, and a finding per start buried the rest of the diagnosis
    // on the 2026-09-13 sample.
    const shown = unqueried.slice(0, MAX_EVIDENCE);
    const first = unqueried[0];
    const list = `#${shown.map((e) => e.i).join(', #')}${unqueried.length > shown.length ? ', …' : ''}`;
    return [
      {
        evidence: shown.map((e) => e.i),
        confidence: 'likely' as const,
        mechanism:
          unqueried.length === 1
            ? `The app ${first.type === 'app_start' ? 'started' : 'resumed'} at #${first.i} and no queryPurchasesAsync followed within a minute.`
            : `The app started or resumed ${unqueried.length} times (${list}) and no queryPurchasesAsync followed any of them within a minute.`,
        nextCheck: `Confirm in the client code that queryPurchasesAsync runs in onBillingSetupFinished and in onResume, and that its results go through the same verify path as a fresh purchase.`,
      },
    ];
  },
});
