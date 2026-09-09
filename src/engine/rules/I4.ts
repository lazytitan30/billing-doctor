import { defineRule } from '../rule.js';

// Personal developer accounts created after 2023-11-13 must pass a closed test
// with 12 testers for 14 days before production access.
export const I4 = defineRule({
  id: 'I4',
  group: 'I',
  severity: 'info',
  title: 'Closed test short of the 12-tester, 14-day requirement',
  detects:
    'A console event with closedTest below 12 testers or 14 days while config.console.accountType is personal. Google requires it of personal accounts created after November 13, 2023; an organisation account was observed not to be subject to it.',
  run(tl) {
    if (tl.config.console?.accountType !== 'personal') return [];
    const hits = [];
    for (const e of tl.events) {
      if (e.kind !== 'console' || !e.closedTest) continue;
      const { testers, days } = e.closedTest;
      if (testers >= 12 && days >= 14) continue;
      hits.push({
        evidence: [e.i],
        confidence: 'certain' as const,
        mechanism: `The closed test at #${e.i} has ${testers} testers over ${days} days; Google requires at least 12 testers opted in continuously for 14 days before a personal account can apply for production access.`,
        nextCheck: `Count only testers who stayed opted in the whole time (opting out resets the 14 days for that tester). Recruit past 12 and wait the full period; then apply for production access in the Console.`,
      });
    }
    return hits;
  },
});
