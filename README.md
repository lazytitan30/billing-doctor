# Billing Doctor

Billing Doctor reads what happened to a Google Play purchase and tells you where it broke. It runs on your machine, calls nothing, changes nothing at Google, and shows its evidence. Not affiliated with Google.

It is for developers who run their own Google Play Billing backend, in Node, Python, PHP, Go or Java, with Capacitor, Flutter, React Native or native Android in front, and did not choose a subscription platform. It is the tool you run at 11 pm when a subscription broke.

## Twenty seconds

```bash
npx billing-doctor diagnose fixtures/rules/G2-void-then-active.json
```

```
billing-doctor 0.1.0: fixtures/rules/G2-void-then-active.json, 11 events, 1 finding: 1 high

HIGH
  G2  Voided purchase, then a fetch reading ACTIVE, and no revoke  [certain]
      evidence  #8 rtdn voidedPurchase tok_a1 [m-2] answered 200 (2026-09-04T10:00:00Z)
                #9 api subscriptionsv2.get tok_a1 → 200 SUBSCRIPTION_STATE_ACTIVE ack ACKNOWLEDGED (2026-09-04T10:00:01Z)
      mechanism tok_a1 was voided at #8 (the money went back); the fetch at #9 still answered ACTIVE and the ledger never revoked, so the refunded user keeps the tier.
      Google    "(1) REFUND_TYPE_FULL_REFUND - The purchase has been fully voided."
                RTDN reference: VoidedPurchaseNotification, read 2026-09-09: https://developer.android.com/google/play/billing/rtdn-reference
      observed  Seen in a live app, 2026-08: after the voided-purchase notification, purchases.subscriptionsv2.get still answered SUBSCRIPTION_STATE_ACTIVE ...
      next      Revoke tok_a1 now. In the handler, act on voidedPurchaseNotification directly: mark refunded and revoke, regardless of what subscriptionsv2.get answers afterwards.
      fix       runbook G2 (billing-doctor rule G2)

1 finding: 1 high
exit 1: a high finding is present
```

Every finding carries the events it rests on, the mechanism, Google's rule quoted with a dated link, a confidence (`certain`, `likely`, `possible`) and the next thing to check. Exit code 1 means a high finding exists, so the command can gate CI.

## What it does

You give it a **timeline**: one JSON file with what happened to one purchase, assembled from your logs, your database, the Cloud Console and the support ticket. The notifications Google sent, the API answers, what your backend wrote, what the user said. Tokens are pseudonyms; nothing real goes in the file.

It checks the timeline against **93 rules** in eleven groups. Every one of them rests on a sentence from Google's own documentation, quoted verbatim with the URL and the date it was read:

| Group | What it catches |
|---|---|
| A. Configuration and permissions | no notifications at all, 401/403, the topic in another project, negative acks, an unauthenticated endpoint, a release below Billing Library 8 after the 2026-08-31 gate, one-time notifications never switched on |
| B. Purchase and acknowledgement | unacknowledged purchases Google refunded, acknowledging or granting while PENDING, consumables acknowledged not consumed, grants before verification, double grants, acknowledgement failures the client never heard about, prepaid windows, multi-quantity purchases granted as one, plan changes blocked by an unacknowledged subscription |
| C. Notifications | the same message applied twice, out-of-order notifications, writes without re-fetching, revoking on a message with no id, unhandled types, chargeback reviews treated as refunds, test notifications applied, messages never acknowledged and never applied |
| D. State interpretation | expiry from the wrong source, CANCELED and grace period treated as no access, hold and pause treated as access, EXPIRED still granting, line items ignored, the deprecated v1 resource, test purchases counted, prepaid treated as renewing, tokens used past the sixty-day window |
| E. Lifecycle events | RECOVERED with no re-grant, RESTARTED as a new token, DEFERRED with the old expiry, hard-coded grace and hold, scheduled cancellations and scheduled pauses treated as immediate, the deprecated type 8, churn that was really an unaccepted price rise |
| F. Upgrades and linked tokens | the old token still granting, DEFERRED replacements granted early, re-signups bound to the wrong token, expiry not re-read after proration, out-of-app resubscribes left unlinked, upgrades that drop the obfuscated account id |
| G. Refunds and voided purchases | REVOKED still granting, the void that the state read disagrees with, partial refunds handled as full, no voided-purchases sweep, refunds without revoke, cancel where revoke was meant, refunds of an order that is not the latest |
| H. Account binding and restore | unmappable notifications, raw account ids, findOne on a shared token, no queryPurchasesAsync on resume, suspended subscriptions not asked for, a different Google account |
| I. Testing and Console | test renewals minutes apart, test rows in production, approved but not published, the 12-tester rule, verified but nothing written, tester purchases refunded after three minutes |
| J. Ledger integrity | grants without an idempotency key, tokens kept after expiry, real data in the timeline, expiry in local time, rows keyed on the order id |
| K. The device and the Play Billing Library | an empty catalogue, calls made while disconnected, already-owned purchases nobody investigated, recoverable failures never retried, unrecoverable ones retried anyway, DEVELOPER_ERROR, stale product details, duplicate callbacks, overlapping queries, the base plan id used as the product id, purchases that never reached the server, failures reported as success, cancellations treated as errors |

`billing-doctor rules` lists them; `billing-doctor rule B1` prints one in full.

## Install

Node 20 or later.

```bash
npm install -g billing-doctor
```

Or run it without installing: `npx billing-doctor <command>`.

## Commands

| Command | What it does |
|---|---|
| `billing-doctor init` | writes an empty `timeline.json` with the policy block filled from a few questions |
| `billing-doctor validate timeline.json` | checks the file against the schema; warns when a token, user id or email looks real |
| `billing-doctor diagnose timeline.json` | runs every rule; `--json` for machines, `--rules B1,C3` to run some, `--kit <path>` for the runbook |
| `billing-doctor state sub.json` | explains a `purchases.subscriptionsv2` resource in plain words; `--policy timeline.json` says where your policy disagrees with Google |
| `billing-doctor rtdn message.json` | decodes a Pub/Sub push body: the type name for the integer, the token, and the next step |
| `billing-doctor redact < logs.txt` | replaces purchase tokens with stable `tok_` pseudonyms, removes emails, masks order ids, cuts out private keys and bearer tokens |
| `billing-doctor rules` and `billing-doctor rule <id>` | the catalogue, and one rule with Google's quote and the runbook entry when the kit is present |
| `billing-doctor mcp` | serves the same as six MCP tools over stdio |

Exit codes: 0 nothing to report, 1 a high finding (or an input that could not be decoded), 2 a usage or file error.

## The timeline

[docs/timeline-format.md](docs/timeline-format.md) is the contract. Six event kinds: `app` (what the device reported), `api` (a call to the Play Developer API and its answer), `ledger` (what the backend wrote), `rtdn` (a notification as received), `support` (what the user said), `console` (releases and config changes). A `policy` block says what your backend is supposed to do, so a rule can tell your policy from a bug.

```json
{
  "schema": "billing-doctor-timeline/1",
  "app": { "packageName": "com.example.app", "billingLibrary": "8.0.0", "backend": "node" },
  "policy": { "grantOn": ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"], "ackWithinHours": 72 },
  "events": [
    { "t": "2026-09-01T10:00:00Z", "kind": "app", "type": "purchase_result", "token": "tok_a1", "productId": "basic_monthly", "purchaseState": "PURCHASED" },
    { "t": "2026-09-01T10:00:02Z", "kind": "api", "call": "subscriptionsv2.get", "token": "tok_a1", "status": 200, "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE", "acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING", "expiryTime": "2026-10-01T10:00:00Z" },
    { "t": "2026-09-01T10:00:03Z", "kind": "ledger", "op": "grant", "token": "tok_a1", "userId": "u_1", "idempotencyKey": "tok_a1:grant" }
  ]
}
```

The `fixtures/` folder holds one minimal timeline per rule, three realistic weeks, and five correct lifecycles that must produce nothing. They are the test suite and the best way to learn the format: [fixtures/README.md](fixtures/README.md).

## With a coding agent

The same engine is an MCP server over stdio, so Claude Code, Codex, Gemini CLI or Cursor can call it while you fix the bug. Tools: `diagnose_timeline`, `explain_subscription_state`, `decode_rtdn`, `redact_text`, `list_rules`, `get_rule`.

Configure it as command `npx`, args `["-y", "billing-doctor", "mcp"]`. For Claude Code, this repository is also a plugin (`claude --plugin-dir .` from a checkout, with the skill `/billing-doctor:diagnose`); for Gemini CLI, `gemini extensions install https://github.com/lazytitan30/billing-doctor`.

## The Incident Kit

The free tool is complete on its own. The paid **Incident Kit** is a folder of files that makes the fix faster: a runbook entry per rule (the symptom as the user reports it, the mechanism, the fix, the regression test to add), a set of realistic incident timelines to replay against your own handler in CI, a TypeScript reference implementation of a verify endpoint, an RTDN handler and a reconciliation job, and checklists for the Play Console, Cloud setup, license testing and the Billing Library 8 and 9 migration. Drop the folder next to the tool as `./billing-doctor-kit` (or set `BILLING_DOCTOR_KIT`) and `billing-doctor rule G2` prints the runbook. There is no licence server and no phone-home; the kit is files.

## The one optional network feature

`diagnose --fetch` reads `purchases.subscriptionsv2.get` for every token in a timeline with your own service-account key and appends Google's answers as `api` events, so a timeline built from logs gets Google's current view of each purchase. Off by default; nothing goes anywhere but Google.

```bash
billing-doctor diagnose timeline.json --fetch --service-account ./key.json --token-map ./tokens.json --out augmented.json
```

The timeline keeps its pseudonyms: `tokens.json` maps `tok_a1` to the real purchase token and stays on your machine; the appended events carry the pseudonym and the written file never contains a real token. The key needs the "View financial data" permission in the Play Console. Subscriptions only; one-time products are not fetched.

## Privacy

No network calls by default. No telemetry, ever. Your logs never leave your machine. The one optional network feature above uses your own key and talks only to Google.

## What it is not

Not an SDK, not a hosted service, not a subscription platform, not a dashboard, not legal or financial advice. It never acknowledges, consumes, refunds, revokes, cancels or defers anything. It does not diagnose Apple.

## Where this comes from

The rules are Google's own documentation, turned into checks a machine can run. Every one of the 93 quotes a sentence Google published, with the page, the section and the date it was read, and all 93 live in one file (`src/google/docs.ts`) so a documentation change is a one-file diff with failing tests beside it. The sources are the Android developer site, the Play Developer API reference, the Play Console help centre and the Pub/Sub documentation.

Eight rules also carry a field observation from a live app, dated and marked as an observation, always beside Google's sentence and never in place of it. Those exist because documentation says what should happen and a support inbox says what does: a wrapper that never surfaces the response code, a plugin that returns the base plan id as the product id, a web fallback that resolves with nothing and looks like a sale.

Every rule has a fixture that proves it fires, and five correct lifecycles that must produce no findings at all; a false positive is a release blocker. When a rule misses an incident of yours, open an issue with a redacted timeline (`good first incident`); that is how the catalogue grows.

## Contributing

`npm test` builds and runs everything. One file runs alone: `node --test tests/rules-B.test.js`. A new rule needs its file in `src/engine/rules`, its Google fact in `src/google/docs.ts` (the only file with a Google fact, each dated), its fixture with an `expected.json`, and one line in `src/engine/catalogue.ts`. The five clean fixtures must stay at zero findings; a false positive is a release blocker.

## Licence and trademarks

MIT. Google Play is a trademark of Google LLC. Billing Doctor is an independent project and is not affiliated with, endorsed by, or sponsored by Google.
