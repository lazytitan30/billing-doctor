# The purchase was voided and the subscription still reads ACTIVE

**The ticket.** "The refund went through but the user still has the tier."

**Google's rule.** The voided-purchase notification: "(1) REFUND_TYPE_FULL_REFUND - The purchase has been fully voided." (RTDN reference, read 2026-09-09, https://developer.android.com/google/play/billing/rtdn-reference). The list API, for the ones you missed: `startTime` "cannot be older than 30 days".

**How it happens.** The void notification says the money went back. The subscription resource can still read ACTIVE afterwards. A handler that asks "is it still active?" after the void gets yes and keeps the tier. Seen in a live app in 2026-08: `subscriptionsv2.get` answered ACTIVE after the void; the fix was to revoke on the void and ignore the state read.

**Check it.**

```bash
billing-doctor rtdn message.json     # says: the money went back; revoke now
billing-doctor diagnose timeline.json
```

Rules that speak here: **G2** (void, then a fetch reading ACTIVE, and no revoke), **G4** (no `voidedpurchases.list` sweep inside 30 days), **G3** (a partial refund handled as a full revoke), **C6** (a pending refund review treated as a refund; it is a question with a 24-hour window, not a refund).

**Fix, in short.** Handle `voidedPurchaseNotification` on its own path: mark refunded and revoke, without consulting the state read; keep the token on the row so later notifications still find it; run a daily sweep of `voidedpurchases.list` with `type=1` as the safety net. The Incident Kit's runbook G2 and its reference handler do exactly this.

Not affiliated with Google. Google Play is a trademark of Google LLC.
