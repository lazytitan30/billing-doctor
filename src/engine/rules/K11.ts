import { defineRule } from '../rule.js';
import { SEC_MS, isApp, type AppEv } from '../helpers.js';

const OVERLAP_MS = 2 * SEC_MS;

// The schema is deliberately loose, so a number is only a number once it says so.
function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

// Two catalogue queries in flight at once. The one that lands last wins,
// whether or not it is the newer one.
export const K11 = defineRule({
  id: 'K11',
  group: 'K',
  severity: 'medium',
  title: 'Overlapping product queries',
  detects:
    'Two query_products calls whose durations overlap, or that start within two seconds of each other. Whichever answer arrives last is applied, so a smaller or older result can replace a complete one.',
  run(tl) {
    const queries = tl.events.filter((e): e is AppEv => isApp(e) && e.type === 'query_products');
    const hits = [];
    for (let n = 1; n < queries.length; n += 1) {
      const first = queries[n - 1];
      const second = queries[n];
      const ranFor = num(first.durationMs);
      const overlapping = second.tMs < first.tMs + (ranFor ?? 0) || second.tMs - first.tMs <= OVERLAP_MS;
      if (!overlapping) continue;
      hits.push({
        evidence: [first.i, second.i],
        confidence: ranFor !== undefined ? ('certain' as const) : ('likely' as const),
        mechanism: `A product query started at #${first.i}${ranFor !== undefined ? ` and ran for ${Math.round(ranFor)} ms` : ''}, and another started at #${second.i} before it had finished. Both answers land, and the later arrival overwrites the earlier one regardless of which is more complete.`,
        nextCheck: `Put every caller behind one shared promise per set of product ids, so launch, shop open, sign-in and resume all wait on the same query. Number the results and refuse to apply one older than the newest already applied.`,
      });
      break;
    }
    return hits;
  },
});
