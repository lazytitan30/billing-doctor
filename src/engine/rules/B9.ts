import { defineRule } from '../rule.js';
import { DAY_MS, expiryOf, isAckOrConsume, isOkGet, isPrepaidGet, isPurchaseResult, isRevokedNotification, isVoided, iso, precedes } from '../helpers.js';

// A prepaid purchase or top-up acknowledged too late, or not at all. The window
// is three days for plans of a week or longer, half the plan for shorter ones.
export const B9 = defineRule({
  id: 'B9',
  group: 'B',
  severity: 'high',
  title: 'Prepaid purchase or top-up not acknowledged inside its window',
  detects:
    'A prepaid resource read as ACKNOWLEDGEMENT_STATE_PENDING with no acknowledgement inside three days (plans of a week or longer) or half the plan length (shorter plans), and the window has passed. Google revokes the top-up, the remaining plan, and refunds.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const get = events.find((e) => isPrepaidGet(e) && e.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING');
      if (!get || !isOkGet(get)) continue;
      const purchase = [...events].reverse().find((e) => isPurchaseResult(e) && precedes(e, get));
      const startMs = purchase ? purchase.tMs : get.tMs;
      const expiry = expiryOf(get);
      const planDays = get.planDurationDays ?? (expiry !== undefined ? (expiry - startMs) / DAY_MS : undefined);
      if (planDays === undefined) continue;
      const windowMs = planDays >= 7 ? 3 * DAY_MS : (planDays * DAY_MS) / 2;
      const deadline = startMs + windowMs;
      if (events.some((e) => isAckOrConsume(e) && e.tMs <= deadline)) continue;
      if (tl.endMs <= deadline) continue;
      const loss = events.find((e) => e.tMs > deadline && (isVoided(e) || isRevokedNotification(e)));
      const evidence = purchase ? [purchase.i, get.i] : [get.i];
      if (loss) evidence.push(loss.i);
      hits.push({
        evidence,
        confidence: loss ? ('certain' as const) : ('likely' as const),
        mechanism: `${token} is a prepaid plan of ${Math.round(planDays * 10) / 10} days, so the acknowledgement was due by ${iso(deadline)} (${planDays >= 7 ? 'three days' : 'half the plan length'}); none was recorded by then${loss ? `, and Google revoked and refunded it at ${iso(loss.tMs)}` : ''}.`,
        nextCheck: `Check the acknowledgementState on purchases.subscriptionsv2.get for ${token}. Prepaid top-ups arrive as a new purchase token and each one must be acknowledged; make the top-up path acknowledge inside the window.`,
      });
    }
    return hits;
  },
});
