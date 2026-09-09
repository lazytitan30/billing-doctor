import { defineRule } from '../rule.js';
import { DAY_MS, isApi } from '../helpers.js';

// The voided-purchases list looks back 30 days at most; a missed notification
// older than that is gone.
export const G4 = defineRule({
  id: 'G4',
  group: 'G',
  severity: 'medium',
  title: 'No voidedpurchases.list sweep inside 30 days',
  detects:
    'policy.voidedPurchasesSweep set to false, or a timeline longer than 30 days with no voidedpurchases.list call and no policy saying one runs. The list API cannot look back further than 30 days.',
  run(tl) {
    if (tl.policy.voidedPurchasesSweep === true) return [];
    const spanDays = (tl.endMs - tl.startMs) / DAY_MS;
    const swept = tl.events.some((e) => isApi(e) && e.call === 'voidedpurchases.list');
    if (tl.policy.voidedPurchasesSweep === false) {
      return [
        {
          evidence: [],
          confidence: 'certain' as const,
          mechanism: 'policy.voidedPurchasesSweep is false: no job reads purchases.voidedpurchases.list. A voided-purchase notification that is missed and is older than 30 days cannot be recovered through the API.',
          nextCheck: 'Add a daily job that calls voidedpurchases.list with type=1 (subscriptions too) and revokes what it finds; keep its startTime inside the last 30 days.',
        },
      ];
    }
    if (spanDays <= 30 || swept) return [];
    return [
      {
        evidence: [],
        confidence: 'possible' as const,
        mechanism: `The timeline spans ${Math.round(spanDays)} days with no purchases.voidedpurchases.list call and no policy.voidedPurchasesSweep declaration.`,
        nextCheck: 'If a sweep runs, set policy.voidedPurchasesSweep to true. If not, add a daily job that calls voidedpurchases.list with type=1 and revokes what it finds.',
      },
    ];
  },
});
