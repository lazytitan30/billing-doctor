import { defineRule } from '../rule.js';
import { HOUR_MS, isApp, precedes } from '../helpers.js';
import { STALE_DETAILS_MS, outcomeOf, saysStaleDetails } from './deviceCodes.js';

// Product details go stale. Launching the flow with an old object fails.
export const K8 = defineRule({
  id: 'K8',
  group: 'K',
  severity: 'medium',
  title: 'Purchase flow launched from stale product details',
  detects:
    'A launch_billing_flow that failed more than six hours after the last query_products, or one whose error names the product details as expired. Google says not to cache product details because stale objects make the flow fail.',
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
      // The library sometimes says so outright, and then the clock does not matter.
      const said = saysStaleDetails(flow);
      if (!said && ageMs < STALE_DETAILS_MS) continue;
      hits.push({
        evidence: [last.i, flow.i],
        confidence: said ? ('certain' as const) : ('likely' as const),
        mechanism: said
          ? `The purchase flow at #${flow.i} failed with a message naming the product details as expired. They were fetched at #${last.i}, ${Math.round(ageMs / HOUR_MS)} hours earlier.`
          : `The catalogue was last queried at #${last.i}, ${Math.round(ageMs / HOUR_MS)} hours before the purchase flow at #${flow.i}, which failed with ${outcome.name}.`,
        nextCheck: `Query the product details again immediately before launching the flow rather than reusing a cached object from app start. If the shop is long-lived, refresh on resume.`,
      });
    }
    return hits;
  },
});
