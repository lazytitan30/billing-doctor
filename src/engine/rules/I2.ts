import { defineRule } from '../rule.js';
import { isLedgerWrite, isOkGet, precedes } from '../helpers.js';

// A test purchase written to production tables as if it were paid for.
export const I2 = defineRule({
  id: 'I2',
  group: 'I',
  severity: 'medium',
  title: 'Test purchase rows in production entitlement or revenue tables',
  detects:
    'A resource marked testPurchase followed by a ledger write for the token that is not marked as a test row. The marker exists to be excluded; a test row in a production table is revenue that never arrived.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const read = events.find((e) => isOkGet(e) && e.testPurchase === true);
      if (!read) continue;
      const write = events.find((e) => isLedgerWrite(e) && precedes(read, e) && e.test !== true);
      if (!write) continue;
      hits.push({
        evidence: [read.i, write.i],
        confidence: 'certain' as const,
        mechanism: `${token} is a test purchase (#${read.i}); the ledger ${write.op} at #${write.i} carries no test marker, so the row is indistinguishable from a paid one.`,
        nextCheck: `Store testPurchase on the row when it is written, and filter on it in entitlement counts, revenue reports and reconciliation.`,
      });
    }
    return hits;
  },
});
