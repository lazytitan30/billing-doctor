# Billing Library 8 migration: entitlements broke

**The ticket.** "We migrated to Billing Library 8 and purchases stopped acknowledging." Or the Console refused the update.

**Google's rule.** "By Aug 31, 2026, all new apps and updates to existing apps must use Billing Library version 8 or later. If you need more time to update your app, you can request an extension until Nov 1, 2026." (Deprecation FAQ, read 2026-09-09, https://developer.android.com/google/play/billing/deprecation-faq). Version 8 has its own gate on 2027-08-31; the integration guide's samples are on 9.1.0. "existing apps still work, but new apps and updates must use supported versions."

**How it happens.** Every version has a two-year cycle, and the migration touches the exact places bugs hide: pending purchases (`enablePendingPurchases` is required; grant nothing and acknowledge nothing while PENDING), `queryPurchasesAsync` on connection and resume, the purchases-updated listener, product details, and the acknowledgement path. A rushed migration surfaces three days later as refunds.

**Check it.** Take a timeline of the first real purchase on the new build:

```bash
billing-doctor init                  # writes the policy block from questions
billing-doctor diagnose timeline.json
```

Rules that speak here: **A6** (a release below 8 after the gate), **B1**, **B2**, **B3** (acknowledgement and pending purchases), **B6** (grant before verification), **H4** (no `queryPurchasesAsync` on resume).

**Fix, in short.** Follow the migration checklist: pending purchases, the async query, server-side acknowledgement after the grant, consumables consumed, replacements with an explicit mode and `linkedPurchaseToken` handled. Watch the acknowledgement watchdog's counts for a week after release. The Incident Kit's `checklists/library-8-9-migration.md` is the list.

Not affiliated with Google. Google Play is a trademark of Google LLC.
