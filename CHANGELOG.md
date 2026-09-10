# Changelog

## 0.1.0 (unreleased)

First release.

- The `billing-doctor-timeline/1` format: six event kinds, a policy block, validation with warnings for real-looking tokens, user ids and emails.
- 89 rules in eleven groups, each with Google's rule quoted verbatim and dated in `src/google/docs.ts` (read 2026-09-09, and 2026-09-10 for the second sweep).
- Group K: the device and the Play Billing Library. Fourteen rules about what the app on the phone did, read from the numeric BillingResponseCode where a native app can see it and from the wrapper's error text where it cannot, at a lower confidence.
- One minimal fixture per rule, three composite weeks, five clean lifecycles that must produce nothing.
- Commands: `diagnose`, `init`, `validate`, `state`, `rtdn`, `redact`, `rules`, `rule`, `mcp`.
- MCP server over stdio with six tools; Claude Code plugin and skill; Gemini CLI extension; MCP registry manifest.
- Kit detection: a `billing-doctor-kit` folder unlocks runbook text. No licence server, no network.
- `diagnose --fetch`: the one optional network feature. Signs a service-account JWT with node:crypto, reads `purchases.subscriptionsv2.get` for each token through a local pseudonym map, appends the answers as api events; the real token never enters the file. Off by default.
- Rules refined by replaying the Incident Kit fixtures through its reference implementation: C3 exempts voided-purchase notifications (the void is acted on directly), G1 yields when a later fetch still reads a granting state, B7 and D7 understand one grant per product on a multi-item subscription, D2 and D3 do not count the invalidation of a replaced token, F2 compares tiers. Line items accept deferredItemReplacement.
