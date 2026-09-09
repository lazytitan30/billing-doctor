---
name: diagnose
description: Diagnose a Google Play Billing incident (a subscription or one-time purchase that broke: lost access, refund still granted, double credit, notifications missing, acknowledgement failures) by building a redacted timeline and running billing-doctor over it. Use when a user reports a Play Billing bug, asks about RTDN notifications, subscription states, acknowledgement, linked purchase tokens, voided purchases, or asks to check a billing backend against Google's rules.
---

# Billing Doctor: diagnose a Google Play Billing incident

Billing Doctor reads what happened to a Google Play purchase and tells you where it broke, with evidence and Google's rule quoted with a dated link. It runs locally, calls nothing, changes nothing at Google. Not affiliated with Google.

## When to reach for it

- A user lost access, kept access after a refund, got double credit, or "notifications just stopped".
- A support ticket names a purchase and you have logs, a database row and maybe a Pub/Sub message.
- You are about to change the RTDN handler or the verify endpoint and want a regression check.

## How to use it

1. **Redact first.** Never paste a raw purchase token, an email, an order id or a user id into a file you will share. Run `billing-doctor redact < logs.txt > logs.redacted.txt` (or the `redact_text` MCP tool). Tokens become stable `tok_` pseudonyms, so one purchase can still be followed across lines.
2. **Build the timeline.** `billing-doctor init` writes an empty `timeline.json` with the policy block filled from questions. Add events in time order, one per fact, using the event kinds in `docs/timeline-format.md`:
   - `app`: what the device reported (`purchase_result` with `purchaseState`, `query_purchases`, `app_start`).
   - `api`: each call to the Play Developer API and its answer, fields copied from the resource (`subscriptionsv2.get` with `subscriptionState`, `acknowledgementState`, `lineItems`, `linkedPurchaseToken`).
   - `ledger`: what the backend wrote (`grant`, `revoke`, `ack`, `expiry`, with `idempotencyKey` and, for notification-driven writes, the Pub/Sub `messageId`).
   - `rtdn`: each notification as received (`notificationType`, `messageId`, `eventTimeMillis`, `endpointStatus`).
   - `support`: what the user said. `console`: releases and config changes.
   Where the events come from: Railway or Cloud Run logs give `api` and `rtdn` events; the entitlement table gives `ledger` events; the Pub/Sub console gives redeliveries; the ticket gives `support`.
3. **Validate and diagnose.** `billing-doctor validate timeline.json`, then `billing-doctor diagnose timeline.json` (or the `diagnose_timeline` MCP tool). Findings are grouped by severity; each carries the event indexes it rests on, the mechanism, Google's rule, a confidence (`certain`, `likely`, `possible`) and the next check. Exit code 1 means a high finding exists.
4. **Read one rule.** `billing-doctor rule G2` (or `get_rule`) prints the rule, Google's quote and, when the Incident Kit folder is present, the runbook entry with the fix and the regression test.

Useful on their own: `billing-doctor rtdn message.json` decodes a Pub/Sub push body and says what the next step must be; `billing-doctor state sub.json --policy timeline.json` explains a `subscriptionsv2` resource in plain words and says where the policy disagrees with Google.

## What it will not do

It never acknowledges, consumes, refunds, revokes, cancels or defers anything. It does not call Google unless `--fetch` is passed with the developer's own credentials. It does not diagnose Apple.

## MCP tools

`diagnose_timeline`, `explain_subscription_state`, `decode_rtdn`, `redact_text`, `list_rules`, `get_rule`. Start the server with `billing-doctor mcp`; configure it as command `npx`, args `["-y", "billing-doctor", "mcp"]`.
