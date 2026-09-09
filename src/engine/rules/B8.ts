import { defineRule } from '../rule.js';
import { isAck, isAckAttempt, isLedger, isOk, precedes } from '../helpers.js';

// The acknowledgement failed, the client was told success, and nothing retried.
// The three-day clock keeps running while everyone believes it is done.
export const B8 = defineRule({
  id: 'B8',
  group: 'B',
  severity: 'high',
  title: 'Acknowledgement failed, client told success, no retry',
  detects:
    'An acknowledge or consume call that did not answer 2xx, followed by a client_response of success for the same token and no later successful acknowledgement. The client stops retrying and Google refunds after three days.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const failed of events.filter((e) => isAckAttempt(e) && !isOk(e.status))) {
        const success = events.find(
          (e) => isLedger(e) && e.op === 'client_response' && e.result === 'success' && precedes(failed, e),
        );
        if (!success) continue;
        if (events.some((e) => isAck(e) && precedes(failed, e))) continue;
        hits.push({
          evidence: [failed.i, success.i],
          confidence: 'certain' as const,
          mechanism: `The acknowledgement for ${token} answered ${failed.status === 0 ? 'nothing (timeout)' : failed.status} at #${failed.i}, the client was told success at #${success.i}, and no acknowledgement succeeded afterwards.`,
          nextCheck: `Check the acknowledgementState on purchases.subscriptionsv2.get for ${token}. If it is still PENDING, acknowledge now (inside three days of purchase); then make the verify path answer an error when the acknowledgement fails, so the client retries it, and add a watchdog that retries pending acknowledgements.`,
        });
      }
    }
    return hits;
  },
});
