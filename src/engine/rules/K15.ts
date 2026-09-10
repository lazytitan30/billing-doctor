import { defineRule } from '../rule.js';
import { HOUR_MS, isApp, isOkGet, type AppEv, type ApiEv } from '../helpers.js';

const NEAR_MS = 24 * HOUR_MS;

// Google holds a purchase and the device query cannot see it. The app offers
// the item again, and Google refuses the sale as already owned.
export const K15 = defineRule({
  id: 'K15',
  group: 'K',
  severity: 'high',
  title: 'Google holds a purchase the device query did not return',
  detects:
    'A query_purchases that returned nothing, and a read of the Developer API within a day showing a purchase that is owned or active. The device and Google disagree about what the user has, and the device is the one the shop is built from.',
  run(tl) {
    const empty = tl.events.filter((e): e is AppEv => isApp(e) && e.type === 'query_purchases' && e.returned === 0);
    if (empty.length === 0) return [];
    const owned = tl.events.filter((e): e is ApiEv => {
      if (!isOkGet(e)) return false;
      const live = e.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' || e.purchaseState === 'PURCHASED';
      return live;
    });
    const hits = [];
    for (const query of empty) {
      const near = owned.find((e) => Math.abs(e.tMs - query.tMs) <= NEAR_MS);
      if (!near) continue;
      hits.push({
        evidence: [query.i, near.i],
        confidence: 'likely' as const,
        mechanism: `The device query at #${query.i} returned nothing, and the read at #${near.i} shows Google still holds ${near.token ?? 'this purchase'} as owned. The shop is built from the empty answer, so the user is offered something they already have and the entitlement they paid for is missing.`,
        nextCheck: `Check three things in order. The device must be signed in to the account that bought it, since a second Google account on the phone answers for itself. The query must ask for the right product type, and for subscriptions it must set includeSuspendedSubscriptions when a suspended one still matters. Then check the wrapper: a query that swallows a failed store call and returns an empty list rather than an error produces exactly this. Until it is fixed, treat an empty answer as unknown rather than as "owns nothing".`,
      });
      break;
    }
    return hits;
  },
});
