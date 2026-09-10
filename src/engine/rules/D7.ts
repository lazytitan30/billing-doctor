import { defineRule } from '../rule.js';
import { isLedger, isOkGet, iso, precedes, type LedgerEv } from '../helpers.js';

// A resource with several line items, and a ledger that read only the first.
export const D7 = defineRule({
  id: 'D7',
  group: 'D',
  severity: 'medium',
  title: 'Only lineItems[0] read while the resource carries several items',
  detects:
    'A resource with more than one line item followed by a ledger write that read one item, or stored the first item\'s expiry while another item expires later. Subscriptions with add-ons carry several items, each with its own expiry.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      for (const read of events) {
        if (!isOkGet(read) || !read.lineItems || read.lineItems.length < 2) continue;
        const nextRead = events.find((e) => isOkGet(e) && precedes(read, e));
        const writes = events.filter((e): e is LedgerEv => isLedger(e) && precedes(read, e) && (!nextRead || precedes(e, nextRead)));
        // A deferred replacement has not started yet; it is not an item the ledger should hold now.
        const deferred = new Set(read.lineItems.map((i) => i.deferredItemReplacement?.productId).filter((p): p is string => typeof p === 'string'));
        const current = read.lineItems.filter((i) => !deferred.has(i.productId));
        const explicit = writes.find((w) => w.lineItemsRead === 1);
        const first = current[0]?.expiryTime ? Date.parse(current[0].expiryTime) : undefined;
        const latest = Math.max(...current.map((item) => (item.expiryTime ? Date.parse(item.expiryTime) : Number.NEGATIVE_INFINITY)));
        const storedLatest = writes.some((w) => w.expiry !== undefined && Math.abs(Date.parse(w.expiry) - latest) <= 60_000);
        const onlyFirst =
          current.length >= 2 &&
          !storedLatest &&
          writes.find((w) => w.expiry !== undefined && first !== undefined && Math.abs(Date.parse(w.expiry) - first) <= 60_000 && latest > first + 60_000);
        const write = explicit ?? onlyFirst;
        if (!write) continue;
        hits.push({
          evidence: [read.i, write.i],
          confidence: 'certain' as const,
          mechanism: `The resource for ${token} at #${read.i} carries ${read.lineItems.length} line items (${read.lineItems.map((i) => i.productId).join(', ')}); the ledger at #${write.i} ${write.lineItemsRead === 1 ? 'read one' : `stored ${write.expiry}, the first item's expiry, while another item runs to ${iso(latest)}`}.`,
          nextCheck: `Read every entry of lineItems[], and store the entitlement and expiry per productId.`,
        });
      }
    }
    return hits;
  },
});
