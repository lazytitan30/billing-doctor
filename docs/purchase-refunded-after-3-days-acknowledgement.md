# The purchase was refunded after three days: acknowledgement

**The ticket.** "The user paid, had access for three days, then Google refunded them and the app locked them out. We never touched it."

**Google's rule.** Acknowledgement "must be done within three days so that the purchase isn't automatically refunded and entitlement revoked." (Integrate the library, read 2026-09-09, https://developer.android.com/google/play/billing/integrate). Every initial purchase and every prepaid top-up needs it; renewals do not. A purchase acknowledged while PENDING does not count: the window starts when the state becomes PURCHASED.

**How it happens.** The acknowledgement lives in the verify path after the grant, and any failure there (a timeout, a missing Console permission, a handler that catches the error and still answers success to the client) leaves the purchase unacknowledged while the user already has access. Three days later Google refunds and revokes, and the ticket arrives.

**Check it.** Build a timeline with the purchase result, the `subscriptionsv2.get` answer (its `acknowledgementState`), the acknowledge call and its HTTP status, what the client was told, and the voided-purchase notification. Then:

```bash
billing-doctor diagnose timeline.json
```

Rules that speak here: **B1** (never acknowledged, then refunded), **B8** (acknowledgement failed, client told success, no retry), **B2** (acknowledged while PENDING), **B9** (prepaid windows). `billing-doctor rule B1` prints the rule with Google's quote.

**Fix, in short.** Acknowledge on the server right after the grant is committed; store an `acknowledged` flag beside `granted`; answer an error to the client when the acknowledgement fails so it retries; run a watchdog that acknowledges pending rows inside the three-day window. The Incident Kit's runbook entries B1 and B8 carry the steps, the regression tests, and a reference verify endpoint that does this.

Not affiliated with Google. Google Play is a trademark of Google LLC.
