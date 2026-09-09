import { defineRule } from '../rule.js';
import { iso } from '../helpers.js';

const GATE = Date.parse('2026-08-31T00:00:00Z');
const EXTENSION = '2026-11-01';

function major(version: string): number {
  const m = /^(\d+)/.exec(version.trim());
  return m ? Number(m[1]) : Number.NaN;
}

// New apps and updates must use Billing Library 8 or later from 2026-08-31.
export const A6 = defineRule({
  id: 'A6',
  group: 'A',
  severity: 'high',
  title: 'Release built on a Billing Library below 8 after the 2026-08-31 gate',
  detects:
    'A console event dated on or after 2026-08-31 with billingLibrary below 8.0.0. Google stops accepting new apps and updates on older versions at that date, with extensions to 2026-11-01; published binaries keep working.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      if (e.kind !== 'console' || !e.billingLibrary || e.tMs < GATE) continue;
      const m = major(e.billingLibrary);
      if (!Number.isFinite(m) || m >= 8) continue;
      hits.push({
        evidence: [e.i],
        confidence: 'certain' as const,
        mechanism: `A release on ${iso(e.tMs)} carries Billing Library ${e.billingLibrary}; from 2026-08-31 new apps and updates must use version 8 or later (extension possible until ${EXTENSION}).`,
        nextCheck: `Check the Play Console policy status page for the warning and the extension form. Migrate to library 8 or 9 before the next upload, and read the migration notes for the acknowledgement and pending-purchase changes.`,
      });
    }
    return hits;
  },
});
