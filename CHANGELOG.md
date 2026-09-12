# Changelog

## 0.1.0 (2026-09-12)

First release.

- The `billing-doctor-timeline/1` format: six event kinds, a policy block, validation with warnings for real-looking tokens, user ids and emails.
- 93 rules in eleven groups, each with Google's rule quoted verbatim and dated in `src/google/docs.ts` (read 2026-09-09, and 2026-09-10 for the later sweeps).
- Rules written against incidents strangers reported in public issue trackers, not only against the documentation: B12 an acknowledgement confirmed only on the device, B13 a pending purchase nobody followed, F7 two live subscriptions with no link between them, K15 Google holding a purchase the device query did not return.
- Corrections the same incidents forced: K5 no longer advises retrying BILLING_UNAVAILABLE, which Google says a retry is unlikely to fix and which K7 owns; K7 now speaks for a single occurrence, because one is already a user who cannot buy; response code 5 is handed to K2 when the message names a connection already in progress and to K8 when it names the product details as expired; H1 no longer requires an explicitly null field, since Google omits absent ones; A1 and A7 stay silent in a timeline with no record from the backend, where the absence of a notification proves nothing.
- Group K: the device and the Play Billing Library. Fourteen rules about what the app on the phone did, read from the numeric BillingResponseCode where a native app can see it and from the wrapper's error text where it cannot, at a lower confidence.
- One minimal fixture per rule, three composite weeks, five clean lifecycles that must produce nothing.
- Commands: `diagnose`, `init`, `validate`, `state`, `rtdn`, `redact`, `rules`, `rule`, `mcp`.
- MCP server over stdio with six tools; Claude Code plugin and skill; Gemini CLI extension; MCP registry manifest.
- Kit detection: a `billing-doctor-kit` folder unlocks runbook text. No licence server, no network.
- `diagnose --fetch`: the one optional network feature. Signs a service-account JWT with node:crypto, reads `purchases.subscriptionsv2.get` for each token through a local pseudonym map, appends the answers as api events; the real token never enters the file. Off by default.
- Rules refined by replaying the Incident Kit fixtures through its reference implementation: C3 exempts voided-purchase notifications (the void is acted on directly), G1 yields when a later fetch still reads a granting state, B7 and D7 understand one grant per product on a multi-item subscription, D2 and D3 do not count the invalidation of a replaced token, F2 compares tiers. Line items accept deferredItemReplacement.
