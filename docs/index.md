# Billing Doctor

Billing Doctor reads what happened to a Google Play purchase and tells you where it broke. It runs on your machine, calls nothing, changes nothing at Google, and shows its evidence. Not affiliated with Google.

```bash
npx billing-doctor diagnose timeline.json
```

- [The timeline format](timeline-format.md): the one file you build from your logs, your database and the support ticket.
- The rules: 97 in eleven groups, each resting on a sentence from Google's documentation, quoted verbatim with the date it was read. `billing-doctor rules` lists them; `billing-doctor rule B1` prints one.
- [The repository](https://github.com/lazytitan30/billing-doctor): source, fixtures, tests, the MCP server, the Claude Code plugin and the Gemini CLI extension.

## When something specific broke

- [The purchase was refunded after three days: acknowledgement](purchase-refunded-after-3-days-acknowledgement.md)
- [SUBSCRIPTION_REVOKED arrived and the user still has access](subscription-revoked-not-handled.md)
- [What to do with linkedPurchaseToken](linkedpurchasetoken-what-to-do.md)
- [Notifications are not arriving: the Pub/Sub permission](rtdn-notifications-not-arriving-pubsub-permission.md)
- [The purchase was voided and the subscription still reads ACTIVE](voided-purchase-still-active.md)
- [SUBSCRIPTION_STATE_CANCELED and the user still has access](subscription-state-canceled-still-has-access.md)
- [Billing Library 8 migration: entitlements broke](billing-library-8-migration-entitlements-broke.md)

## Reading

- [The fifteen ways a Google Play subscription breaks quietly](fifteen-ways-a-google-play-subscription-breaks-quietly.md)

## The Incident Kit

The free tool is complete on its own. The paid Incident Kit is a folder of files: a runbook entry per rule (symptom, mechanism, Google's rule, the fix, the regression test), forty incident timelines to replay against your own handler, a TypeScript reference backend with tests, and checklists for the Console, Cloud, testing and the library migration. Drop it next to the tool and `billing-doctor rule G2` prints the runbook. No licence server, no phone-home.

Google Play is a trademark of Google LLC. Billing Doctor is an independent project and is not affiliated with, endorsed by, or sponsored by Google.
