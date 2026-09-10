import { defineRule } from '../rule.js';
import { isSubscriptionNotification, precedes } from '../helpers.js';

// A cancellation caused by a price increase nobody accepted is not churn.
export const E8 = defineRule({
  id: 'E8',
  group: 'E',
  severity: 'info',
  title: 'Cancellation after an unaccepted price increase counted as ordinary churn',
  detects:
    'A price change notification followed by a cancellation, with no consent notification in between. Google cancels the subscription at the renewal when an opt-in increase is not accepted, so the cause is the price, not the user leaving.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const priceChange = events.find((e) => isSubscriptionNotification(e, 19));
      if (!priceChange) continue;
      const cancelled = events.find((e) => isSubscriptionNotification(e, 3) && precedes(priceChange, e));
      if (!cancelled) continue;
      const consented = events.some((e) => isSubscriptionNotification(e, 22) && precedes(priceChange, e) && precedes(e, cancelled));
      if (consented) continue;
      hits.push({
        evidence: [priceChange.i, cancelled.i],
        confidence: 'possible' as const,
        mechanism: `${token} received a price change at #${priceChange.i} and was cancelled at #${cancelled.i} with no consent recorded in between. An opt-in increase that the user never accepts cancels the subscription at the renewal it applies to.`,
        nextCheck: `Check whether this user ever confirmed the new price. If not, record the cancellation as price-driven rather than voluntary, and look at how the increase was communicated in the app. Handle types 19 and 22, not the deprecated type 8.`,
      });
    }
    return hits;
  },
});
