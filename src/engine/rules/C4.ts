import { defineRule } from '../rule.js';
import { between, isLedger, isOkGet, isRevoke, isRtdn, precedes } from '../helpers.js';

// A notification with no messageId cannot be de-duplicated; revoking on it
// without a fetch revokes on a signal nobody can verify or recognise again.
export const C4 = defineRule({
  id: 'C4',
  group: 'C',
  severity: 'medium',
  title: 'Revoked on a notification that carried no messageId, without a fetch',
  detects:
    'A notification whose messageId is null, followed by a ledger revoke for the token with no successful purchases.*.get between them. A redelivery would carry no id either, so the revoke can neither be verified nor recognised.',
  run(tl) {
    const hits = [];
    for (const rtdn of tl.events.filter((e) => isRtdn(e) && e.messageId === null && e.token)) {
      const events = tl.byToken.get(rtdn.token!) ?? [];
      const nextLedger = events.find((e) => isLedger(e) && precedes(rtdn, e));
      if (!nextLedger || !isRevoke(nextLedger)) continue;
      const laterRtdn = events.find((e) => isRtdn(e) && precedes(rtdn, e));
      if (laterRtdn && precedes(laterRtdn, nextLedger)) continue;
      if (between(events, rtdn, nextLedger).some(isOkGet)) continue;
      hits.push({
        evidence: [rtdn.i, nextLedger.i],
        confidence: 'certain' as const,
        mechanism: `Notification #${rtdn.i} for ${rtdn.token} arrived without a Pub/Sub messageId and the ledger revoked at #${nextLedger.i} without fetching the resource first.`,
        nextCheck: `Fetch purchases.subscriptionsv2.get for ${rtdn.token} and compare with the ledger. Acknowledge a notification that has no id (answer 200), log it loudly, and act only on what the fetch says.`,
      });
    }
    return hits;
  },
});
