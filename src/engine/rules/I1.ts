import { defineRule } from '../rule.js';
import { HOUR_MS, isOkGet, isSubscriptionNotification } from '../helpers.js';

// License-tester subscriptions renew every few minutes. Not a fault.
export const I1 = defineRule({
  id: 'I1',
  group: 'I',
  severity: 'info',
  title: 'Renewals minutes apart on a test purchase',
  detects:
    'Two SUBSCRIPTION_RENEWED notifications less than an hour apart for a token whose resource is marked testPurchase. Test subscriptions renew on an accelerated clock, at most six times; nothing is wrong.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      if (!events.some((e) => isOkGet(e) && e.testPurchase === true)) continue;
      const renewals = events.filter((e) => isSubscriptionNotification(e, 2));
      for (let n = 1; n < renewals.length; n += 1) {
        if (renewals[n].tMs - renewals[n - 1].tMs >= HOUR_MS) continue;
        hits.push({
          evidence: [renewals[n - 1].i, renewals[n].i],
          confidence: 'certain' as const,
          mechanism: `${token} is a test purchase and renewed at #${renewals[n - 1].i} and again at #${renewals[n].i}, ${Math.round((renewals[n].tMs - renewals[n - 1].tMs) / 60_000)} minutes later. That is the test clock (a month renews every five minutes).`,
          nextCheck: `Nothing to fix. Exclude the token from revenue and entitlement counts (see D9 and I2), and expect it to expire after six renewals.`,
        });
        break;
      }
    }
    return hits;
  },
});
