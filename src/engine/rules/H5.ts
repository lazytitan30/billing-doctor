import { defineRule } from '../rule.js';
import { isApp, isOkGet, precedes } from '../helpers.js';

// Suspended subscriptions (on hold, paused) come back from queryPurchasesAsync
// only when asked for.
export const H5 = defineRule({
  id: 'H5',
  group: 'H',
  severity: 'low',
  title: 'queryPurchasesAsync without includeSuspendedSubscriptions while the user is on hold or paused',
  detects:
    'A query_purchases event with includeSuspendedSubscriptions false while the last state Google answered is ON_HOLD or PAUSED. Without the parameter the suspended subscription is not returned and the app shows nothing to restore.',
  run(tl) {
    const hits = [];
    for (const query of tl.events.filter((e) => isApp(e) && e.type === 'query_purchases' && e.includeSuspendedSubscriptions === false)) {
      const lastRead = [...tl.events].reverse().find((e) => isOkGet(e) && e.subscriptionState !== undefined && precedes(e, query));
      if (!lastRead || !isOkGet(lastRead)) continue;
      if (lastRead.subscriptionState !== 'SUBSCRIPTION_STATE_ON_HOLD' && lastRead.subscriptionState !== 'SUBSCRIPTION_STATE_PAUSED') continue;
      hits.push({
        evidence: [lastRead.i, query.i],
        confidence: 'certain' as const,
        mechanism: `The last state read (#${lastRead.i}) was ${lastRead.subscriptionState.replace('SUBSCRIPTION_STATE_', '')} and the app queried purchases at #${query.i} without includeSuspendedSubscriptions, so the subscription was not in the answer.`,
        nextCheck: `Set includeSuspendedSubscriptions on QueryPurchasesParams when the app needs to show a "fix your payment" or "resume" path; the server decides access either way.`,
      });
    }
    return hits;
  },
});
