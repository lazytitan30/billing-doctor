import { defineRule } from '../rule.js';
import { isSubscriptionNotification } from '../helpers.js';
import { SUBSCRIPTION_NOTIFICATION_TYPES } from '../../google/rtdn.js';

// A notification type the handler does not switch on. Type 8 is deprecated and
// is E6's business, not this rule's.
export const C5 = defineRule({
  id: 'C5',
  group: 'C',
  severity: 'medium',
  title: 'Notification type received that the handler does not handle',
  detects:
    'A subscription notification type present in the timeline and absent from policy.handledNotificationTypes. A type that falls through to a default branch is a state change nobody applied.',
  run(tl) {
    const handled = tl.policy.handledNotificationTypes;
    if (!handled) return [];
    const seen = new Map<number, number[]>();
    for (const e of tl.events) {
      if (!isSubscriptionNotification(e) || e.notificationType === undefined || e.notificationType === 8) continue;
      if (handled.includes(e.notificationType)) continue;
      seen.set(e.notificationType, [...(seen.get(e.notificationType) ?? []), e.i]);
    }
    const hits = [];
    for (const [type, indexes] of seen) {
      const info = SUBSCRIPTION_NOTIFICATION_TYPES[type];
      hits.push({
        evidence: indexes.slice(0, 5),
        confidence: 'possible' as const,
        mechanism: `Type ${type}${info ? ` (${info.name}: ${info.meaning})` : ' (not in the reference read on 2026-09-09)'} arrived ${indexes.length} time${indexes.length === 1 ? '' : 's'} and policy.handledNotificationTypes does not list it.`,
        nextCheck: `Read the handler's switch. If it is state-based (every notification re-fetches and applies the resource), list every type as handled and this goes away; if it switches on types, add ${type} and decide what it changes.`,
      });
    }
    return hits;
  },
});
