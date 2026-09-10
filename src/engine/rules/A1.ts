import { defineRule } from '../rule.js';
import { MIN_MS, hasServerView, isPurchaseResult, isRtdn, iso } from '../helpers.js';

// Several purchases and not one notification: nothing is being published.
export const A1 = defineRule({
  id: 'A1',
  group: 'A',
  severity: 'high',
  title: 'Purchases produce no notifications',
  detects:
    'Two or more PURCHASED results with no notification for their tokens inside fifteen minutes, in a timeline that runs past that window and that carries some record from the backend. Without the Pub/Sub Publisher grant to Google\'s notification account, nothing arrives.',
  run(tl) {
    if (!hasServerView(tl)) return [];
    const silent = [];
    for (const purchase of tl.events.filter((e) => isPurchaseResult(e) && e.purchaseState === 'PURCHASED' && e.token)) {
      const windowEnd = purchase.tMs + 15 * MIN_MS;
      if (tl.endMs < windowEnd) continue;
      const notified = tl.events.some((e) => isRtdn(e) && e.token === purchase.token && e.tMs > purchase.tMs && e.tMs <= windowEnd);
      if (!notified) silent.push(purchase);
    }
    if (silent.length < 2) return [];
    return [
      {
        evidence: silent.map((e) => e.i),
        confidence: 'likely' as const,
        mechanism: `${silent.length} purchases (${silent.map((e) => e.token).join(', ')}, the first at ${iso(silent[0].tMs)}) and no notification for any of them within fifteen minutes.`,
        nextCheck: `In the Cloud Console, open the Pub/Sub topic and check that google-play-developer-notifications@system.gserviceaccount.com holds Pub/Sub Publisher; in the Play Console, Monetization setup, send a test notification and watch the endpoint log. Check the topic name matches, project and all.`,
      },
    ];
  },
});
