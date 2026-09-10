import { defineRule } from '../rule.js';
import { HOUR_MS, isApp, precedes } from '../helpers.js';
import { outcomeOf } from './deviceCodes.js';

const STALE_AFTER_MS = 6 * HOUR_MS;

// Product details go stale. Launching the flow with an old object fails.
export const K8 = defineRule({
  id: 'K8',
  group: 'K',
  severity: 'medium',
  title: 'Purchase flow launched from stale product details',
  detects:
    'A launch_billing_flow that failed more than six hours after the last query_products, with no fresh query in between. Google says not to cache product details because stale objects make the flow fail.',
  run(tl) {
    const hits = [];
    for (const flow of tl.events) {
      if (!isApp(flow) || flow.type !== 'launch_billing_flow') continue;
      const outcome = outcomeOf(flow);
      if (!outcome || outcome.code === 0 || outcome.code === 1) continue;
      const queries = tl.events.filter((q) => isApp(q) && q.type === 'query_products' && precedes(q, flow));
      if (queries.length === 0) continue;
      const last = queries[queries.length - 1];
      const ageMs = flow.tMs - last.tMs;
      if (ageMs < STALE_AFTER_MS) continue;
      hits.push({
        evidence: [last.i, flow.i],
        confidence: 'likely' as const,
        mechanism: `The catalogue was last queried at #${last.i}, ${Math.round(ageMs / HOUR_MS)} hours before the purchase flow at #${flow.i}, which failed with ${outcome.name}.`,
        nextCheck: `Query the product details again immediately before launching the flow rather than reusing a cached object from app start. If the shop is long-lived, refresh on resume.`,
      });
    }
    return hits;
  },
});
