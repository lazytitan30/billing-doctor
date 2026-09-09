import { defineRule } from '../rule.js';
import { looksLikePseudonym } from '../timeline.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Real tokens, emails and user ids inside a timeline are real data about a
// real person, and a purchase token is a bearer credential.
export const J3 = defineRule({
  id: 'J3',
  group: 'J',
  severity: 'medium',
  title: 'Timeline carries a real-looking token, email or user id',
  detects:
    'Events whose token is not a tok_ pseudonym, whose userId looks like a UUID or email, or whose text contains an email address. Redact before this file is pasted into an issue or an assistant.',
  run(tl) {
    const offenders: number[] = [];
    const reasons = new Set<string>();
    for (const e of tl.events) {
      const tokens = [e.token, (e as { oldToken?: string }).oldToken, (e as { linkedPurchaseToken?: string | null }).linkedPurchaseToken];
      let bad = false;
      for (const token of tokens) {
        if (typeof token === 'string' && token.length > 0 && !looksLikePseudonym(token)) {
          bad = true;
          reasons.add('a purchase token that is not a pseudonym');
        }
      }
      const userId = (e as { userId?: string }).userId;
      if (typeof userId === 'string' && (UUID_RE.test(userId) || EMAIL_RE.test(userId))) {
        bad = true;
        reasons.add('a raw user id');
      }
      if (EMAIL_RE.test(JSON.stringify(e))) {
        bad = true;
        reasons.add('an email address');
      }
      if (bad) offenders.push(e.i);
    }
    if (offenders.length === 0) return [];
    return [
      {
        evidence: offenders.slice(0, 5),
        confidence: 'certain' as const,
        mechanism: `${offenders.length} event${offenders.length === 1 ? '' : 's'} carry ${[...reasons].join(', ')}${offenders.length > 5 ? ' (first five cited)' : ''}.`,
        nextCheck: `Run billing-doctor redact over the source logs and rebuild the timeline from the output; tokens become stable tok_ pseudonyms, emails are removed, order ids keep their last four characters.`,
      },
    ];
  },
});
