# Changelog

## 0.1.1 (2026-09-14)

What the second measurement found, fixed. On 2026-09-13 the catalogue was scored, frozen, against thirty-five incidents nobody here wrote; it named the cause in twenty, and it also said things about the file rather than the fault. This release is that list.

- Four rules for the blind spots the sample left, each resting on a sentence of Google's read on 2026-09-14: B14 a purchase never acknowledged inside the window with no refund recorded yet, because Google's clock runs whether or not the file saw it; F8 CHARGE_PRORATED_PRICE used for a change that is not a price increase per unit of time, which Play refuses and which K5 no longer advises retrying; K16 a restore that relies on the device for consumed purchases, which Billing Library 8 cannot return; K17 ITEM_UNAVAILABLE at purchase time, with Google's list of what makes a product purchasable.
- Not written: a rule for the deferred replacement mode returning an empty purchase list. Google's page now says the new purchase token is surfaced right away; the empty list was the old behaviour, and a rule without a current quote does not ship.
- Less noise on a timeline that carries nothing from the server. K10 (a purchase that never reached the server) and B12 (an acknowledgement never confirmed at Google) now say once, at medium severity and lower confidence, that the file cannot show it, instead of one high finding per token; with server events in the file they are unchanged. H4 reports the missing queryPurchasesAsync once per timeline rather than once per start.
- Rules that read across sessions, across users or across a missing ledger: K9 counts a second connection only within one app session and ignores attempts that failed; K2 looks for the connection a call waited for in its own session only; A7 no longer takes a products read Google refused as evidence of a sale; I5 no longer counts a client_response as a write, and speaks at lower confidence when the file has no ledger row at all, since the ledger may have been left out; K4 does not read a second buyer as a re-purchase when the accounts differ.
- K10 also recognises a purchase the device first reported through a later query_purchases as PURCHASED, the same fact by another road.
- Ten noise fixtures in `fixtures/noise`, one per pattern the sample showed, each recording what the tool says now; a fixture that starts saying more fails the build.

## 0.1.0 (2026-09-13)

First release.

- The `billing-doctor-timeline/1` format: six event kinds, a policy block, validation with warnings for real-looking tokens, user ids and emails.
- Ninety-three rules in eleven groups, each with Google's rule quoted verbatim and dated in `src/google/docs.ts` (read 2026-09-09, and 2026-09-10 for the later sweeps).
- Rules written against incidents strangers reported in public issue trackers, not only against the documentation: B12 an acknowledgement confirmed only on the device, B13 a pending purchase nobody followed, F7 two live subscriptions with no link between them, K15 Google holding a purchase the device query did not return.
- Corrections the same incidents forced: K5 no longer advises retrying BILLING_UNAVAILABLE, which Google says a retry is unlikely to fix and which K7 owns; K7 now speaks for a single occurrence, because one is already a user who cannot buy; response code 5 is handed to K2 when the message names a connection already in progress and to K8 when it names the product details as expired; H1 no longer requires an explicitly null field, since Google omits absent ones; A1 and A7 stay silent in a timeline with no record from the backend, where the absence of a notification proves nothing.
- Group K: the device and the Play Billing Library. Fourteen rules about what the app on the phone did, read from the numeric BillingResponseCode where a native app can see it and from the wrapper's error text where it cannot, at a lower confidence.
- One minimal fixture per rule, three composite weeks, five clean lifecycles that must produce nothing.
- Commands: `diagnose`, `init`, `validate`, `state`, `rtdn`, `redact`, `rules`, `rule`, `mcp`.
- MCP server over stdio with six tools; Claude Code plugin and skill; Gemini CLI extension; MCP registry manifest.
- Kit detection: a `billing-doctor-kit` folder unlocks runbook text. No licence server, no network.
- `diagnose --fetch`: the one optional network feature. Signs a service-account JWT with node:crypto, reads `purchases.subscriptionsv2.get` for each token through a local pseudonym map, appends the answers as api events; the real token never enters the file. Off by default.
- Rules refined by replaying the Incident Kit fixtures through its reference implementation: C3 exempts voided-purchase notifications (the void is acted on directly), G1 yields when a later fetch still reads a granting state, B7 and D7 understand one grant per product on a multi-item subscription, D2 and D3 do not count the invalidation of a replaced token, F2 compares tiers. Line items accept deferredItemReplacement.
