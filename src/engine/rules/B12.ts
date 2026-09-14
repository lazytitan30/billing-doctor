import { defineRule } from '../rule.js';
import { hasServerView, isApi, isApp, isOk, isOkGet, precedes, type AppEv } from '../helpers.js';

const MAX_EVIDENCE = 5;

// The device said the acknowledgement worked. Only the resource knows.
export const B12 = defineRule({
  id: 'B12',
  group: 'B',
  severity: 'high',
  title: 'Acknowledged on the device and never confirmed at Google',
  detects:
    "A device acknowledge or consume for a token, with no successful acknowledgement call to the Developer API and no later read showing the resource acknowledged. The wrapper reported its own call, not Google's answer.",
  run(tl) {
    const unconfirmed: Array<{ token: string; onDevice: AppEv }> = [];
    for (const [token, events] of tl.byToken) {
      const onDevice = events.find((e): e is AppEv => isApp(e) && (e.type === 'acknowledge' || e.type === 'consume'));
      if (!onDevice) continue;
      // Either proof will do: the backend's own call, or a resource that says so.
      const backendCall = events.some((e) => isApi(e) && isOk(e.status) && /\.(acknowledge|consume)$/.test(e.call));
      if (backendCall) continue;
      const confirmed = events.some(
        (e) => isOkGet(e) && e.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' && precedes(onDevice, e),
      );
      if (confirmed) continue;
      unconfirmed.push({ token, onDevice });
    }
    if (unconfirmed.length === 0) return [];
    if (hasServerView(tl)) {
      return unconfirmed.map(({ token, onDevice }) => ({
        evidence: [onDevice.i],
        confidence: 'likely' as const,
        mechanism: `${token} was acknowledged on the device at #${onDevice.i} and nothing ever confirmed it at Google: no acknowledgement call answered 2xx, and no later read of the resource says ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED. A wrapper that returns success is reporting its own call.`,
        nextCheck: `Read the resource after acknowledging and check acknowledgementState. If it still says pending, the acknowledgement did not land and the three-day clock is still running, which ends as B1. Acknowledge from the backend after verifying, where the answer is Google's own, and keep the device call as a convenience rather than as the record.`,
      }));
    }
    // A timeline with nothing from the server cannot confirm anything at
    // Google, so one finding says so for all of them; a finding per token at
    // full strength buried the cause on the 2026-09-13 sample.
    const shown = unconfirmed.slice(0, MAX_EVIDENCE);
    const tokens = `${shown.map((u) => u.token).join(', ')}${unconfirmed.length > shown.length ? ', …' : ''}`;
    const one = unconfirmed.length === 1;
    return [
      {
        evidence: shown.map((u) => u.onDevice.i),
        confidence: 'possible' as const,
        severity: 'medium' as const,
        mechanism: `${one ? `${tokens} was` : `${unconfirmed.length} purchases (${tokens}) were`} acknowledged on the device, and this timeline carries nothing from the server, so nothing in it can confirm the acknowledgement at Google. A wrapper that returns success is reporting its own call.`,
        nextCheck: `Read each resource from the backend and add the answer as an api event: acknowledgementState is Google's record. If it still says pending, the acknowledgement did not land and the three-day clock is running, which ends as B1; acknowledge from the backend after verifying, where the answer is Google's own.`,
      },
    ];
  },
});
