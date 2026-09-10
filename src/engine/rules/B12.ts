import { defineRule } from '../rule.js';
import { isApi, isApp, isOk, isOkGet, precedes } from '../helpers.js';

// The device said the acknowledgement worked. Only the resource knows.
export const B12 = defineRule({
  id: 'B12',
  group: 'B',
  severity: 'high',
  title: 'Acknowledged on the device and never confirmed at Google',
  detects:
    'A device acknowledge or consume for a token, with no successful acknowledgement call to the Developer API and no later read showing the resource acknowledged. The wrapper reported its own call, not Google\'s answer.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const onDevice = events.find((e) => isApp(e) && (e.type === 'acknowledge' || e.type === 'consume'));
      if (!onDevice) continue;
      // Either proof will do: the backend's own call, or a resource that says so.
      const backendCall = events.some((e) => isApi(e) && isOk(e.status) && /\.(acknowledge|consume)$/.test(e.call));
      if (backendCall) continue;
      const confirmed = events.some(
        (e) => isOkGet(e) && e.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' && precedes(onDevice, e),
      );
      if (confirmed) continue;
      hits.push({
        evidence: [onDevice.i],
        confidence: 'likely' as const,
        mechanism: `${token} was acknowledged on the device at #${onDevice.i} and nothing ever confirmed it at Google: no acknowledgement call answered 2xx, and no later read of the resource says ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED. A wrapper that returns success is reporting its own call.`,
        nextCheck: `Read the resource after acknowledging and check acknowledgementState. If it still says pending, the acknowledgement did not land and the three-day clock is still running, which ends as B1. Acknowledge from the backend after verifying, where the answer is Google's own, and keep the device call as a convenience rather than as the record.`,
      });
    }
    return hits;
  },
});
