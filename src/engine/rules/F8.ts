import { defineRule } from '../rule.js';
import { isApp, type AppEv } from '../helpers.js';
import { howKnown, outcomeOf } from './deviceCodes.js';

// How the refusal arrived in the one case on record (the 2026-09-13 sample,
// so08): SERVICE_UNAVAILABLE, with DF-DFERH-01 in the message. Google's page
// does not say how it is reported, so nothing else is guessed at: a
// DEVELOPER_ERROR on a replacement is K6's, and the first sample had one
// whose cause was an unacknowledged subscription, not the price.
const REFUSED = new Set([2]);

// The prorated-charge mode is for upgrades only, and Google measures an
// upgrade by the price per unit of time, not by the plan's length or its name.
export const F8 = defineRule({
  id: 'F8',
  group: 'F',
  severity: 'medium',
  title: 'CHARGE_PRORATED_PRICE used for a change that is not a price increase',
  detects:
    'A replacement flow in CHARGE_PRORATED_PRICE mode that failed with SERVICE_UNAVAILABLE. Google allows the mode only for an upgrade where the price per unit of time increases, and a plan that is cheaper per unit comes back as that server error, which no retry can clear.',
  run(tl) {
    const failed = tl.events.filter((e): e is AppEv => {
      if (!isApp(e) || e.type !== 'launch_billing_flow' || e.replacementMode !== 'CHARGE_PRORATED_PRICE') return false;
      const outcome = outcomeOf(e);
      return outcome !== undefined && REFUSED.has(outcome.code);
    });
    if (failed.length === 0) return [];
    const first = failed[0];
    const outcome = outcomeOf(first)!;
    const again = failed.length - 1;
    return [
      {
        evidence: failed.slice(0, 5).map((e) => e.i),
        confidence: again > 0 ? ('likely' as const) : ('possible' as const),
        mechanism: `The change from ${first.oldToken ?? 'the old subscription'} to ${first.productId ?? 'the new plan'} was launched in CHARGE_PRORATED_PRICE mode and failed with ${outcome.name} at #${first.i} (${howKnown(outcome)})${again > 0 ? `, and again ${again} time${again > 1 ? 's' : ''}` : ''}. Google allows that mode only when the price per unit of time goes up; a longer plan that costs less per month than the one it replaces is not an upgrade in that sense, however much it costs in total, and Play refuses it.`,
        nextCheck: `Compare the two plans' price per unit of time. If the new one is not higher, use WITH_TIME_PRORATION or CHARGE_FULL_PRICE for this change, or DEFERRED for a downgrade, and choose the mode per pair of plans rather than once for the whole shop. Only if the price per unit really does increase is this a transient failure worth retrying.`,
      },
    ];
  },
});
