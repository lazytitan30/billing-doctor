import { defineRule } from '../rule.js';
import { isLedgerWrite, isSubscriptionNotification } from '../helpers.js';

// Type 8 is deprecated; price changes arrive as 19 and 22 now.
export const E6 = defineRule({
  id: 'E6',
  group: 'E',
  severity: 'info',
  title: 'Deprecated SUBSCRIPTION_PRICE_CHANGE_CONFIRMED handled as current',
  detects:
    'Type 8 listed in policy.handledNotificationTypes, or a ledger write driven by a type 8 notification. Google marks 8 deprecated; 19 and 22 carry price changes.',
  run(tl) {
    const hits = [];
    for (const rtdn of tl.events.filter((e) => isSubscriptionNotification(e, 8) && e.messageId)) {
      const write = tl.events.find((e) => isLedgerWrite(e) && e.messageId === rtdn.messageId);
      if (!write) continue;
      hits.push({
        evidence: [rtdn.i, write.i],
        confidence: 'certain' as const,
        mechanism: `A deprecated type 8 notification (#${rtdn.i}) drove ledger ${write.op} #${write.i}.`,
        nextCheck: `Handle SUBSCRIPTION_PRICE_CHANGE_UPDATED (19) and SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED (22); read the price change details from the resource rather than from the type.`,
      });
    }
    if (tl.policy.handledNotificationTypes?.includes(8)) {
      const handled = tl.policy.handledNotificationTypes;
      const missing = [19, 22].filter((t) => !handled.includes(t));
      hits.push({
        evidence: [],
        confidence: 'possible' as const,
        mechanism: `policy.handledNotificationTypes lists the deprecated type 8${missing.length ? ` and not ${missing.join(' or ')}` : ''}.`,
        nextCheck: `Move the price-change handling to types 19 and 22 and drop 8 from the switch.`,
      });
    }
    return hits;
  },
});
