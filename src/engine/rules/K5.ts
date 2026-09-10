import { defineRule } from '../rule.js';
import { MIN_MS, isApp, precedes } from '../helpers.js';
import { RETRIABLE, howKnown, outcomeOf } from './deviceCodes.js';

const WINDOW_MS = 10 * MIN_MS;

// A transient failure that nobody retried. The user sees a dead paywall.
export const K5 = defineRule({
  id: 'K5',
  group: 'K',
  severity: 'medium',
  title: 'A recoverable device failure with no retry',
  detects:
    'A device call that failed with a code Google lists as recoverable, and no further attempt at the same operation within ten minutes. These clear on their own; not retrying turns a blip into a lost sale.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      if (!isApp(e)) continue;
      const outcome = outcomeOf(e);
      if (!outcome || outcome.code === 0 || !RETRIABLE.has(outcome.code)) continue;
      // Already owned has its own rule, and its answer is to look, not to retry.
      if (outcome.code === 7 || outcome.code === 8) continue;
      // Billing unavailable and feature not supported are K7's: Google says an
      // automatic retry is unlikely to help, so telling anyone to retry here
      // would be wrong.
      if (outcome.code === 3 || outcome.code === -2) continue;
      const retried = tl.events.some(
        (r) => isApp(r) && r.type === e.type && precedes(e, r) && r.tMs <= e.tMs + WINDOW_MS,
      );
      if (retried) continue;
      hits.push({
        evidence: [e.i],
        confidence: outcome.exact ? ('likely' as const) : ('possible' as const),
        mechanism: `${e.type} failed with ${outcome.name} at #${e.i} (${howKnown(outcome)}) and was not attempted again within ten minutes. Google lists that code as recoverable.`,
        nextCheck: `Retry the call. Use a simple retry where the user is waiting and exponential backoff for anything in the background, and cap it so a retry loop cannot run while someone stares at a spinner.`,
      });
    }
    return hits;
  },
});
