# SUBSCRIPTION_REVOKED arrived and the user still has access

**The ticket.** "Google refunded the user (or we revoked through the API) and the app still lets them in."

**Google's rule.** "(12) SUBSCRIPTION_REVOKED - A subscription has been revoked from the user before the expiration time." (RTDN reference, read 2026-09-09, https://developer.android.com/google/play/billing/rtdn-reference). "When you revoke, the user immediately loses access to the subscription."

**How it happens.** The handler switches on notification types and has no branch for 12, or has one that logs and returns. Nothing in the ledger changes. A type-based handler misses every type it was not written for; a state-based handler (fetch the resource, apply what it says) does not.

**Check it.** A timeline with the type 12 notification, any fetch afterwards, and the ledger's last grant and revoke for the token:

```bash
billing-doctor diagnose timeline.json
billing-doctor rtdn message.json     # decodes the push body and names the type
```

Rules that speak here: **G1** (REVOKED with the ledger still granting), **C3** (a write with no fetch in between), **C5** (types the handler does not handle). If a fetch after the notification still reads ACTIVE, G1 stays quiet: Google did not confirm its own notification, and keeping access was right.

**Fix, in short.** On type 12, fetch `purchases.subscriptionsv2.get`; on EXPIRED, or 404, revoke. Run a daily reconciliation that compares every granted row with Google. The Incident Kit's runbook G1 and its reference handler show both.

Not affiliated with Google. Google Play is a trademark of Google LLC.
