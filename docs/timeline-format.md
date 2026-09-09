# The timeline format: `billing-doctor-timeline/1`

One JSON file describes what happened to one purchase, or a few related ones. You assemble it from your logs, your database, the Cloud Console and the support ticket. `billing-doctor init` writes an empty one with your policy filled in; `billing-doctor validate` checks it; `billing-doctor diagnose` runs the rules over it.

Every rule reads only this file. Nothing in it should be a real identifier: tokens are `tok_` pseudonyms (see `billing-doctor redact`), users are `u_1`, `u_2`, order ids are masked. The validator warns when something looks real.

```json
{
  "schema": "billing-doctor-timeline/1",
  "app": { "packageName": "com.example.app", "billingLibrary": "8.0.0", "backend": "node" },
  "policy": { "...": "what your backend is supposed to do" },
  "config": { "...": "Console and Cloud facts" },
  "events": [ { "t": "2026-09-01T10:00:00Z", "kind": "app", "type": "purchase_result", "token": "tok_a1" } ]
}
```

## Top level

| Field | Meaning |
|---|---|
| `schema` | Always `billing-doctor-timeline/1`. |
| `app.packageName` | Your package name. |
| `app.billingLibrary` | The Play Billing Library version in the release the user has. |
| `app.backend` | `node`, `python`, `php`, `go`, `java`: only used in messages. |
| `app.products` | Map of product id to `subscription`, `consumable` or `non-consumable`. Lets the rules see a consumable that was acknowledged instead of consumed. |
| `policy.grantOn` | Subscription states your backend grants access on. Default: ACTIVE, IN_GRACE_PERIOD, CANCELED. |
| `policy.revokeOn` | States it revokes on. Default: ON_HOLD, PAUSED, EXPIRED. |
| `policy.ackWithinHours` | How fast you acknowledge. Default 72. |
| `policy.refetchOnEveryNotification` | Whether every notification is followed by an API call before state changes. |
| `policy.handledNotificationTypes` | The notification types your handler switches on. Types in the timeline that are not here are reported. |
| `policy.voidedPurchasesSweep` | Whether a job calls `voidedpurchases.list` inside every 30-day window. |
| `policy.gracePeriodDays`, `policy.accountHoldDays` | Only if your backend hard-codes them. Google sets both per base plan; hard-coding is reported. |
| `config.project` | The Cloud project you assume the service account and the app live in. |
| `config.rtdn.topicProject` | The Cloud project that actually holds the Pub/Sub topic. |
| `config.rtdn.pushEndpointAuth` | `none`, `oidc` or `shared-secret`. |
| `config.serviceAccountRoles` | The Play Console permissions on the service account, as named in the Console. |
| `config.console.managedPublishing` | Whether managed publishing is on. |
| `config.console.accountType` | `personal` or `organisation`; `config.console.accountCreated` is the date it was created. |

## Events

Every event has `t` (ISO 8601 with `Z` or an offset; a bare local time is refused), `kind`, and usually `token`. `note` is free text anywhere. Extra fields are kept and ignored.

### `app`: what the device reported

| Field | Meaning |
|---|---|
| `type` | `purchase_result`, `query_purchases`, `app_start`, `app_resume`, `billing_connected`, `launch_billing_flow`, `acknowledge`, `consume`. |
| `productId`, `purchaseState` | From the `Purchase` object: `PURCHASED`, `PENDING`, `UNSPECIFIED_STATE`. |
| `obfuscatedAccountId` | What the app passed at purchase time. `null` if it passed nothing. |
| `quantity` | For multi-quantity one-time products. |
| `includeSuspendedSubscriptions` | On `query_purchases`, whether the parameter was set. |
| `replacementMode`, `oldToken` | For an upgrade, downgrade or re-signup: the mode and the token being replaced. |
| `googleAccount`, `appAccount` | Pseudonyms for the Google account that paid and the app account signed in, when they differ. |

### `api`: a call to the Google Play Developer API and its answer

| Field | Meaning |
|---|---|
| `call` | `subscriptionsv2.get`, `subscriptions.get` (v1, deprecated), `productsv2.get`, `products.get`, `subscriptions.acknowledge`, `products.acknowledge`, `products.consume`, `subscriptionsv2.cancel`, `subscriptions.cancel`, `subscriptionsv2.revoke`, `subscriptions.revoke`, `subscriptionsv2.defer`, `subscriptions.defer`, `subscriptions.refund`, `orders.refund`, `orders.reviewRefund`, `voidedpurchases.list`. |
| `status` | The HTTP status Google answered. `0` for a timeout. |
| `subscriptionState`, `acknowledgementState`, `expiryTime`, `lineItems`, `linkedPurchaseToken`, `testPurchase`, `externalAccountIdentifiers`, `pausedStateContext`, `canceledStateContext` | Copied from the `SubscriptionPurchaseV2` resource. `expiryTime` is a shorthand for a single line item; use `lineItems` (each with `productId`, `expiryTime`, `autoRenewingPlan` or `prepaidPlan`) when there are several. `externalAccountIdentifiers: null` means the resource carried none. |
| `purchaseState`, `consumptionState`, `quantity`, `refundableQuantity` | Copied from a `products` or `productsv2` resource. |
| `planDurationDays` | For prepaid plans: the plan length, which sets the acknowledgement window. |
| `revoke` | On `orders.refund`: whether access was revoked with the refund. |
| `startTime` | On `voidedpurchases.list`: the start of the window asked for. |

### `ledger`: what your backend wrote

| Field | Meaning |
|---|---|
| `op` | `grant`, `revoke`, `ack`, `consume`, `write`, `expiry`, `lookup`, `purge`, `client_response`, `count`. |
| `userId`, `tier` | Who got what. |
| `idempotencyKey` | The key that makes the write safe to repeat. Its absence is reported. |
| `messageId` | The Pub/Sub `messageId` of the notification that drove this write. This is how the rules connect a write to a notification. |
| `expiry`, `expirySource` | The expiry you stored, and where it came from: `expiryTime` (right), `eventTimeMillis`, `clock`, `plan_length`, `previous_token`. |
| `timezone` | `utc` or `local`, when the comparison or write used a clock. |
| `planType` | `auto-renewing` or `prepaid`, as your backend recorded it. |
| `lineItemsRead` | How many line items you read from the resource. |
| `lookup`, `matchedUsers` | On `lookup`: `findOne`, `pseudonym` or `token`, and how many rows matched. |
| `result` | On `client_response`: `success` or `error`, what the client was told. |
| `metric` | On `count`: `revenue`, `entitlements`, `active_subscribers`. |
| `test` | Whether the row is marked as a test purchase. |
| `fromState` | The subscription state you had read when you wrote this. |

### `rtdn`: a notification as received

| Field | Meaning |
|---|---|
| `notification` | Which member of the `DeveloperNotification` was present: `subscription` (default when `notificationType` is set), `oneTimeProduct`, `voidedPurchase`, `pendingRefundReview`, `test`. |
| `notificationType` | The integer from the notification. |
| `messageId` | The Pub/Sub message id. `null` if the envelope carried none. |
| `eventTimeMillis` | From the notification. |
| `endpointStatus` | The HTTP status your endpoint answered. |
| `refundType`, `productType`, `orderId`, `sku` | From a voided or one-time notification. |

### `support` and `console`

`support` carries `note`: what the user said, in their words. `console` carries `note`, optional `billingLibrary`, `release` (`created`, `approved`, `published`, `rolled_back`) and `closedTest` (`{ "testers": 9, "days": 10 }`).

## Where the numbers come from

Findings cite events by their index in the `events` array, counting from zero in file order, so keep the file in the order you assembled it and let the tool sort by time.
