import { defineRule } from '../rule.js';
import { isApi } from '../helpers.js';

// 401 or 403 from the Play Developer API: the service account lacks a permission.
export const A2 = defineRule({
  id: 'A2',
  group: 'A',
  severity: 'high',
  title: 'Play Developer API answered 401 or 403',
  detects:
    'An api event with status 401 or 403. The service account needs "View financial data" to read purchases and "Manage orders and subscriptions" to act on them, granted in the Play Console, and the project needs the API enabled.',
  run(tl) {
    const seen = new Set<string>();
    const hits = [];
    for (const e of tl.events) {
      if (!isApi(e) || (e.status !== 401 && e.status !== 403)) continue;
      if (seen.has(e.call)) continue;
      seen.add(e.call);
      const reads = e.call.endsWith('.get') || e.call === 'voidedpurchases.list';
      hits.push({
        evidence: [e.i],
        confidence: 'certain' as const,
        mechanism: `${e.call} answered ${e.status} at #${e.i}. ${e.status === 401 ? 'The credential was not accepted at all.' : `The credential was accepted and the permission is missing: ${reads ? '"View financial data, orders, and cancellation data survey responses"' : '"Manage orders and subscriptions"'} on the service account.`}`,
        nextCheck: `In the Play Console, Users and permissions, open the service account and check its permissions; in the Cloud Console, check the Google Play Android Developer API is enabled for the project the key belongs to. A new grant can take a while to propagate.`,
      });
    }
    return hits;
  },
});
