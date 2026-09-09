# Billing Doctor

Billing Doctor diagnoses Google Play Billing incidents from a redacted timeline of one purchase: the notifications Google sent, the API answers, what the backend wrote, what the user said. It runs locally, calls nothing, changes nothing at Google. Not affiliated with Google.

Use its tools when a user reports a Play Billing problem (lost access, refund still granted, double credit, notifications missing, acknowledgement failures) or asks how a subscription state, a notification type or a linked purchase token should be handled.

- `redact_text` first, over any log: tokens become stable `tok_` pseudonyms, emails are removed, order ids are masked, secrets are cut out.
- `diagnose_timeline` on a `billing-doctor-timeline/1` document (see the package's `docs/timeline-format.md`). Every finding carries evidence (event indexes), Google's rule with a dated link, a confidence and a next check.
- `decode_rtdn` on a Pub/Sub push body: the type name and the next step, which is always to re-fetch the resource before touching state.
- `explain_subscription_state` on a `purchases.subscriptionsv2` resource: state, access, expiry per item, acknowledgement deadline, linked token.
- `list_rules` and `get_rule` for the 63-rule catalogue.

It never acknowledges, consumes, refunds, revokes, cancels or defers anything.
