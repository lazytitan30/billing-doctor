# SUBSCRIPTION_STATE_CANCELED and the user still has access

Two tickets, opposite directions.

**"The user cancelled in January and still had access in March."** CANCELED is not EXPIRED. Access ends when `expiryTime` passes and the type 13 notification arrives; a handler with no path for 13, or one that logs and returns, leaves the grant in place forever. Rule **D6** (EXPIRED with the ledger still granting).

**"The user cancelled, we cut them off the same day, and they want the rest of the month."** CANCELED means auto-renew is off; the paid period continues. Rule **D2** (CANCELED treated as no access before expiryTime).

**Google's rule.** "SUBSCRIPTION_STATE_CANCELED: Subscription is canceled but not expired yet." (purchases.subscriptionsv2, read 2026-09-09). "When a subscription is canceled, the user retains access to the content until the end of the current billing cycle. When the billing cycle ends, access should be revoked." (Subscription lifecycle, read 2026-09-09, https://developer.android.com/google/play/billing/lifecycle/subscriptions).

**Check it.**

```bash
billing-doctor state subscription.json --policy timeline.json   # says what access the state implies, and where your policy disagrees
billing-doctor diagnose timeline.json
```

Also in this family: **D3** (grace period treated as no access; the user keeps access while Google retries), **D4** (account hold treated as access), **D5** (paused treated as access), **E1** (RECOVERED with no re-grant).

**Fix, in short.** Grant on ACTIVE, IN_GRACE_PERIOD and CANCELED-with-future-expiry; revoke on ON_HOLD, PAUSED and EXPIRED; store `expiryTime` from the resource on every notification; run a daily reconciliation. The Incident Kit's runbook D2 to D6 and its reference `apply` function put the whole state table in one place.

Not affiliated with Google. Google Play is a trademark of Google LLC.
