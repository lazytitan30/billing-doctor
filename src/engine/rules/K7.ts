import { defineRule } from '../rule.js';
import { MIN_MS, isApp, precedes } from '../helpers.js';
import { howKnown, outcomeOf } from './deviceCodes.js';

const WINDOW_MS = 2 * MIN_MS;
const CANNOT_BE_RETRIED_AWAY = new Set([3, -2]);

// Billing unavailable on this device is a fact about the device, not a blip.
// Automatic retries burn battery and change nothing.
export const K7 = defineRule({
  id: 'K7',
  group: 'K',
  severity: 'low',
  title: 'Retrying a failure the device cannot recover from',
  detects:
    'A call that failed with BILLING_UNAVAILABLE or FEATURE_NOT_SUPPORTED, followed by two or more further attempts within two minutes. Google says automatic retries are unlikely to help; only the user changing the condition does.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      if (!isApp(e)) continue;
      const outcome = outcomeOf(e);
      if (!outcome || !CANNOT_BE_RETRIED_AWAY.has(outcome.code)) continue;
      const retries = tl.events.filter(
        (r) => isApp(r) && r.type === e.type && precedes(e, r) && r.tMs <= e.tMs + WINDOW_MS,
      );
      if (retries.length < 2) continue;
      hits.push({
        evidence: [e.i, ...retries.slice(0, 3).map((r) => r.i)],
        confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
        mechanism: `${e.type} failed with ${outcome.name} at #${e.i} (${howKnown(outcome)}) and was retried ${retries.length} times within two minutes.`,
        nextCheck: `Stop retrying this one automatically. Tell the user what to fix: update the Play Store app, sign in to a Google account, or that purchases are not available in their country or on a work-managed device. Call isFeatureSupported before using a feature rather than discovering it this way.`,
      });
    }
    return hits;
  },
});
