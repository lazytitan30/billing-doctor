import { defineRule } from '../rule.js';
import { isApp, isOkGet, precedes, tokenEvents } from '../helpers.js';

// Google blocks a plan change while the old subscription is unacknowledged.
export const B11 = defineRule({
  id: 'B11',
  group: 'B',
  severity: 'medium',
  title: 'Plan change offered while the existing subscription is unacknowledged',
  detects:
    'A purchase flow carrying an old token whose last known acknowledgement state was pending. Google blocks the upgrade, downgrade or resubscribe, so the user sees a failure with no explanation.',
  run(tl) {
    const hits = [];
    for (const flow of tl.events) {
      if (!isApp(flow) || flow.type !== 'launch_billing_flow' || !flow.oldToken) continue;
      const old = [...tokenEvents(tl, flow.oldToken)].reverse().find((e) => isOkGet(e) && e.acknowledgementState !== undefined && precedes(e, flow));
      if (!old || !isOkGet(old) || old.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_PENDING') continue;
      hits.push({
        evidence: [old.i, flow.i],
        confidence: 'certain' as const,
        mechanism: `${flow.oldToken} was still unacknowledged at #${old.i}, and a plan change against it was launched at #${flow.i}. Google blocks the change until the existing subscription is acknowledged.`,
        nextCheck: `Acknowledge ${flow.oldToken} first, then offer the change. Better: never let a subscription sit unacknowledged, which is what the watchdog in B1 is for. Hide upgrade and downgrade buttons while the current subscription's acknowledgementState is pending.`,
      });
    }
    return hits;
  },
});
