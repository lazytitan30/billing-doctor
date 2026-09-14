import { defineRule } from '../rule.js';
import { isLedger, isLedgerWrite, isOkGet, isPurchaseResult, precedes } from '../helpers.js';

// Verification succeeded and the ledger never wrote: fulfilment failed silently.
export const I5 = defineRule({
  id: 'I5',
  group: 'I',
  severity: 'high',
  title: 'Verification succeeded and nothing was written',
  detects:
    'A PURCHASED result followed by a successful purchases.*.get for the token, and no ledger write for the token afterwards; a reply to the client is not a write. The write after the verify call is where fulfilment lives, and a timeline with no ledger row at all gets this at lower confidence, since the ledger may simply have been left out of the file.',
  run(tl) {
    // The incident this rule comes from had no ledger row at all: the writes
    // failed silently, so there was nothing to include. A reporter who never
    // included their ledger looks the same, which is why the confidence drops
    // rather than the rule going quiet.
    const ledgerInFile = tl.events.some(isLedger);
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const purchase = events.find((e) => isPurchaseResult(e) && e.purchaseState === 'PURCHASED');
      if (!purchase) continue;
      const read = events.find((e) => isOkGet(e) && precedes(purchase, e));
      if (!read) continue;
      if (events.some((e) => isLedgerWrite(e) && precedes(purchase, e))) continue;
      // A lookup that matched nobody explains the missing write: there was no
      // user to write for. That is H1's or H3's finding, not a silent failure
      // of the write itself; the first sample's gh14 is the case.
      if (events.some((e) => isLedger(e) && e.op === 'lookup' && e.matchedUsers === 0 && precedes(purchase, e))) continue;
      // A client_response is what the backend said, not what it wrote. On the
      // 2026-09-13 sample a verify endpoint answered success over an empty
      // ledger, and counting the reply as a write hid exactly that.
      const reply = events.find((e) => isLedger(e) && e.op === 'client_response' && precedes(purchase, e));
      hits.push({
        evidence: reply ? [purchase.i, read.i, reply.i] : [purchase.i, read.i],
        confidence: ledgerInFile ? ('likely' as const) : ('possible' as const),
        mechanism: `${token} was purchased at #${purchase.i} and verified at #${read.i}; no ledger write for it appears afterwards${reply ? `, and the success the client was told at #${reply.i} is a reply, not a row` : ''}${ledgerInFile ? '' : '. No ledger row of any kind appears in this timeline: either the backend wrote nothing, or its ledger was left out of the file'}.`,
        nextCheck: `Check the database role the server uses for INSERT and UPDATE grants on the entitlement tables, and that the write's error is not swallowed. Add a boot-time preflight that verifies the grants and shouts in the deploy log.${ledgerInFile ? '' : ' If the backend did write rows for this token, add them to the timeline as ledger events and this finding goes away.'}`,
      });
    }
    return hits;
  },
});
