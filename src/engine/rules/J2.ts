import { defineRule } from '../rule.js';
import { DAY_MS, isLedger, isOkGet, isSubscriptionNotification, iso } from '../helpers.js';

const KEEP_DAYS = 90;

// A raw purchase token has no operational use long after expiry; keeping it
// is a liability with no upside.
export const J2 = defineRule({
  id: 'J2',
  group: 'J',
  severity: 'low',
  title: 'Raw purchase token kept long after expiry with no purge',
  detects:
    `A token read as EXPIRED, or expired by notification, more than ${KEEP_DAYS} days before the end of the timeline with no ledger purge for it. After expiry and the 30-day voided-purchase window the token has nothing left to be exchanged for.`,
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const expired = events.find(
        (e) => (isOkGet(e) && e.subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED') || isSubscriptionNotification(e, 13),
      );
      if (!expired) continue;
      if (tl.endMs - expired.tMs <= KEEP_DAYS * DAY_MS) continue;
      if (events.some((e) => isLedger(e) && e.op === 'purge')) continue;
      hits.push({
        evidence: [expired.i],
        confidence: 'likely' as const,
        mechanism: `${token} expired at ${iso(expired.tMs)} (#${expired.i}); ${Math.round((tl.endMs - expired.tMs) / DAY_MS)} days later there is no purge of the raw token or the notification payloads.`,
        nextCheck: `Add a nightly job that removes the raw token and payload snapshots ${KEEP_DAYS} days after expiry and keeps the counts and the messageIds; write the retention period down where the privacy notice can cite it.`,
      });
    }
    return hits;
  },
});
