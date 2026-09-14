import { defineRule } from '../rule.js';
import { isApp, isLedger, precedes, type ConsoleEv, type Ev } from '../helpers.js';
import type { NormalizedTimeline } from '../timeline.js';

function major(version: string): number {
  const m = /^(\d+)/.exec(version.trim());
  return m ? Number(m[1]) : Number.NaN;
}

// The latest release recorded before an event, when it names a library version.
function releaseBefore(tl: NormalizedTimeline, before: Ev): ConsoleEv | undefined {
  let found: ConsoleEv | undefined;
  for (const e of tl.events) {
    if (!precedes(e, before)) break;
    if (e.kind === 'console' && e.billingLibrary) found = e;
  }
  return found;
}

// On Billing Library 8 the device cannot see a consumed purchase any more:
// the query returns active purchases only, and the history call is gone.
export const K16 = defineRule({
  id: 'K16',
  group: 'K',
  severity: 'medium',
  title: 'Restore relies on the device for consumed purchases, which Billing Library 8 cannot return',
  detects:
    'A query_purchases that returned nothing after a release on Billing Library 8 or later, in an app that sells consumables and shows no ledger lookup. queryPurchasesAsync returns only active purchases and the purchase-history call is gone, so a consumed purchase can be restored only from a record the backend kept.',
  run(tl) {
    if (!Object.values(tl.app.products ?? {}).includes('consumable')) return [];
    // A restore that already goes through the backend has what it needs.
    if (tl.events.some((e) => isLedger(e) && e.op === 'lookup')) return [];
    for (const query of tl.events) {
      if (!isApp(query) || query.type !== 'query_purchases' || query.returned !== 0) continue;
      const release = releaseBefore(tl, query);
      if (!release || !(major(release.billingLibrary ?? '') >= 8)) continue;
      return [
        {
          evidence: [release.i, query.i],
          confidence: 'possible' as const,
          mechanism: `The release at #${release.i} moved the app to Billing Library ${release.billingLibrary}, and the device query at #${query.i} returned nothing. The app sells consumables; a consumed purchase is not an active one, and on library 8 the call that used to return purchase history is gone, so a user who bought and consumed before a reinstall gets nothing back from the device however the restore is written.`,
          nextCheck: `Check what the restore path reads. If it reads only queryPurchasesAsync, consumed purchases cannot be recovered from the device on library 8: restore them from the backend's record of every purchase, keyed on the user's account, and keep that record from the first purchase on. If this user never bought anything, this finding is nothing.`,
        },
      ];
    }
    return [];
  },
});
