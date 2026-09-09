import { defineRule } from '../rule.js';
import { isPurchaseResult } from '../helpers.js';

// Google binds the purchase to the Google account that paid; which app account
// it belongs to is the developer's decision.
export const H6 = defineRule({
  id: 'H6',
  group: 'H',
  severity: 'info',
  title: 'Purchase made under a Google account different from the app account',
  detects:
    'A purchase whose googleAccount and appAccount pseudonyms differ. Not a bug: a policy to decide and document, since the purchase follows the Google account across app accounts.',
  run(tl) {
    const hits = [];
    for (const purchase of tl.events.filter((e) => isPurchaseResult(e) && e.googleAccount && e.appAccount && e.googleAccount !== e.appAccount)) {
      if (!isPurchaseResult(purchase)) continue;
      hits.push({
        evidence: [purchase.i],
        confidence: 'certain' as const,
        mechanism: `${purchase.token ?? 'The purchase'} was paid by Google account ${purchase.googleAccount} while ${purchase.appAccount} was signed in to the app.`,
        nextCheck: `Decide and write down: does a purchase belong to the app account that was signed in (bind by obfuscated account id) or to the Google account (restore on any app account on the device)? The verify path enforces whichever you choose.`,
      });
    }
    return hits;
  },
});
