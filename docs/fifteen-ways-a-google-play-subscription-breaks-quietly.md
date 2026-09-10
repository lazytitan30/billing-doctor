# The fifteen ways a Google Play subscription breaks quietly

You run your own Google Play Billing backend. You did not pick a subscription platform, for control or cost or because your app is a wrapped web app. Everything works. Then a support ticket arrives at 11 pm, and it is one of these fifteen. Each one is either something that happened in one of two live apps I run, or a behaviour Google documents. Each one has a rule id in [Billing Doctor](https://github.com/lazytitan30/billing-doctor), a free local tool that reads a redacted timeline of the purchase and says where it broke, with Google's sentence quoted and dated. Not affiliated with Google.

**1. "A paying user lost access."** The purchase was granted, then a background account swap replaced the session before the real one restored, and the grant belonged to nobody. Not a billing rule as such, but it started the discipline: every write is keyed by the token, every grant is idempotent (J1).

**2. "The refund went through but the user still has the tier."** The voided-purchase notification said the money went back; `purchases.subscriptionsv2.get` still answered ACTIVE. A handler that asks "is it still active?" after the void keeps the tier. The void is the fact; revoke on it (G2).

**3. "We acknowledged the purchase but Google refunded it three days later anyway."** The acknowledge call failed, the client was told success, nothing retried. Google refunds and revokes unacknowledged purchases after three days (B1, B8).

**4. "The same renewal was processed twice and the user got double credit."** The endpoint answered 500, Pub/Sub redelivered, and the handler had no message-id check. Pub/Sub delivers at least once (C1, A4).

**5. "The user cancelled in January and still had access in March."** CANCELED was treated as EXPIRED, or EXPIRED was never handled. CANCELED keeps access until `expiryTime`; EXPIRED ends it (D2, D6).

**6. "Grace period users were cut off."** IN_GRACE_PERIOD treated as no access. Google retries the payment and extends the expiry; the user keeps access (D3).

**7. "Account hold users kept access for a month."** ON_HOLD treated as active. The grace period ended without payment; access ends (D4).

**8. "After the upgrade the user had both tiers."** The new resource named the old token in `linkedPurchaseToken` and nobody invalidated it (F1).

**9. "Renewals stopped mapping to users."** No obfuscated account id was set at purchase time and the verify call never ran for those tokens, so the notification matched nobody. An HMAC pseudonym passed as `setObfuscatedAccountId` fixed it (H1, H2).

**10. "Notifications just stopped."** The topic lost the publisher grant for Google's notification account, or lived in a Cloud project nobody expected. Nothing errors; the endpoint is quiet (A1, A3).

**11. "Our test purchases inflated revenue and entitlements."** License-tester purchases renew every five minutes and carry `testPurchase`; nobody excluded them (D9, I2).

**12. "Fulfilment silently stopped writing."** The database role lost its grants after a migration; the verify endpoint said success and wrote nothing. A boot-time preflight now checks the grants (I5).

**13. "We handle RENEWED and CANCELED; what is type 20?"** Types 17 to 22 fell through to a default branch that logs and ignores. A state-based handler (fetch, apply) never has this problem (C5, C3).

**14. "A chargeback review notification came in and we revoked access."** A pending refund review is a question with a 24-hour window, not a refund. Access changes when the void arrives (C6).

**15. "We migrated to Billing Library 8 and purchases stopped acknowledging."** The gate for version 7 passed on 2026-08-31 with extensions to 2026-11-01, and the migration touches the acknowledgement path (A6).

What none of these had was a way to lay the events out in order, check them against Google's rules, and see the gap. That is what the tool does:

```bash
npx billing-doctor diagnose timeline.json
```

Every finding carries the event indexes it rests on, the mechanism, Google's rule with a dated link, a confidence, and the next thing to check. It runs on your machine and calls nothing. The same engine is an MCP server, so Claude Code, Codex or Gemini CLI can call it while you fix the bug. And when a rule misses an incident of yours, a redacted timeline in an issue is how the catalogue grows.

Google Play is a trademark of Google LLC.
