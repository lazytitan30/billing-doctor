import { defineRule } from '../rule.js';
import { MIN_MS, isAckOrConsume, isOkGet, isPurchaseResult, precedes } from '../helpers.js';

const TESTER_WINDOW_MS = 3 * MIN_MS;

// Three minutes on a test device, three days in production. Same bug.
export const I6 = defineRule({
  id: 'I6',
  group: 'I',
  severity: 'medium',
  title: 'License tester purchase not acknowledged within three minutes',
  detects:
    'A test purchase with no acknowledgement or consumption within three minutes. Google refunds an unacknowledged tester purchase after three minutes, which is why a broken acknowledgement path looks like a mysterious instant refund in testing.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const test = events.find((e) => isOkGet(e) && e.testPurchase === true);
      if (!test) continue;
      const purchase = events.find(isPurchaseResult) ?? test;
      const deadline = purchase.tMs + TESTER_WINDOW_MS;
      if (tl.endMs <= deadline) continue;
      if (events.some((e) => isAckOrConsume(e) && e.tMs <= deadline)) continue;
      hits.push({
        evidence: [purchase.i, test.i].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b),
        confidence: 'likely' as const,
        mechanism: `${token} is a license tester purchase (#${test.i}) and nothing acknowledged or consumed it within three minutes of #${purchase.i}. Google refunds tester purchases at that point and sends a cancellation email.`,
        nextCheck: `Fix the acknowledgement path, not the test: the same fault refunds real purchases after three days instead of three minutes. Watch the acknowledgementState on the resource while testing, and treat an instant tester refund as the alarm it is.`,
      });
    }
    return hits;
  },
});
