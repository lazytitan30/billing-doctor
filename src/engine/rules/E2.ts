import { defineRule } from '../rule.js';
import { isLedger, isOkGet, isPurchaseResult, isSubscriptionNotification, precedes } from '../helpers.js';

// A restart keeps the token and clears the cancellation fields. A handler that
// expects a new token leaves the real row cancelled and writes somewhere else.
export const E2 = defineRule({
  id: 'E2',
  group: 'E',
  severity: 'medium',
  title: 'SUBSCRIPTION_RESTARTED handled as a new purchase with a new token',
  detects:
    'A type 7 notification with no ledger write on its token afterwards, while a fetch shows the token active again or the ledger wrote a row for the same user under a token no purchase produced. A restore from the Play subscriptions centre keeps the same token.',
  run(tl) {
    const hits = [];
    // Every token that any purchase_result mentions, worked out once. This used
    // to be an inner `tl.events.some(...)` inside a `find` inside a loop, which
    // made the rule cubic: 4,800 events took 23 seconds, and over the MCP
    // server that blocks every other call for as long as it runs.
    const purchasedTokens = new Set<string>();
    for (const e of tl.events) if (isPurchaseResult(e) && typeof e.token === 'string') purchasedTokens.add(e.token);
    for (const [token, events] of tl.byToken) {
      for (const rtdn of events.filter((e) => isSubscriptionNotification(e, 7))) {
        if (events.some((e) => isLedger(e) && precedes(rtdn, e))) continue;
        const user = events.find((e) => isLedger(e) && e.userId)?.userId;
        const stray = tl.events.find(
          (e) =>
            isLedger(e) &&
            precedes(rtdn, e) &&
            e.token !== undefined &&
            e.token !== token &&
            e.userId !== undefined &&
            e.userId === user &&
            !purchasedTokens.has(e.token),
        );
        const read = events.find((e) => isOkGet(e) && precedes(rtdn, e));
        if (!stray && !read) continue;
        hits.push({
          evidence: [rtdn.i, (stray ?? read)!.i],
          confidence: stray ? ('certain' as const) : ('likely' as const),
          mechanism: `${token} restarted at #${rtdn.i} and its ledger row was never touched again; ${stray ? `the backend wrote ${user} under ${stray.token} at #${stray.i}, a token no purchase produced` : `the fetch at #${read!.i} shows the same token live again`}. The restored subscription lives on ${token}.`,
          nextCheck: `Fetch ${token}: its cancellation fields are cleared and it renews again. Update that row${stray ? `, remove the ${stray.token} row,` : ''} and make the type 7 path re-fetch the same token.`,
        });
      }
    }
    return hits;
  },
});
