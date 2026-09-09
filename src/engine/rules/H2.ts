import { defineRule } from '../rule.js';
import { isLedger, isPurchaseResult } from '../helpers.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d{1,12}$/;

// The obfuscated account id must be obfuscated: not an email, not a raw id.
export const H2 = defineRule({
  id: 'H2',
  group: 'H',
  severity: 'medium',
  title: 'Obfuscated account id is a raw user id or an email',
  detects:
    'A purchase whose obfuscatedAccountId is an email, a UUID, a short number, or equal to a userId the ledger uses for the same token. Google refuses cleartext personal data there and recommends a one-way hash.',
  run(tl) {
    const hits = [];
    for (const [token, events] of tl.byToken) {
      const purchase = events.find((e) => isPurchaseResult(e) && typeof e.obfuscatedAccountId === 'string');
      if (!purchase || !isPurchaseResult(purchase)) continue;
      const id = purchase.obfuscatedAccountId as string;
      const ledgerUser = events.find((e) => isLedger(e) && e.userId === id);
      let why: string | undefined;
      if (EMAIL_RE.test(id)) why = 'an email address';
      else if (UUID_RE.test(id)) why = 'a UUID, which is the raw primary key';
      else if (NUMERIC_RE.test(id)) why = 'a plain number, which is the raw primary key';
      else if (ledgerUser) why = `the same value the ledger uses as the user id (#${ledgerUser.i})`;
      if (!why) continue;
      hits.push({
        evidence: ledgerUser ? [purchase.i, ledgerUser.i] : [purchase.i],
        confidence: 'certain' as const,
        mechanism: `The purchase of ${token} was made with obfuscatedAccountId set to ${why}. Google holds it against a payment identity, and it is the same value that appears in your own URLs and responses.`,
        nextCheck: `Compute HMAC-SHA256(user id, a server secret separate from session signing) as 64 hex characters, pass that, and store it on the user row so the notification handler can resolve it without reversing it.`,
      });
    }
    return hits;
  },
});
