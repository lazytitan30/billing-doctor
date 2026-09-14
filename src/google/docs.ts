// Google's rules, one entry per rule id, each with the sentence quoted verbatim
// from Google's documentation, the URL, and the date the page was read. This is
// the only file that carries a Google fact. When documentation changes, this
// file changes and the rule tests say so. A rule without an entry here does not
// ship: googleRule() throws, and tests/docs.test.js checks every rule id.
//
// `quote` is Google's text. `context` is ours: where the sentence sits and what
// it means for the rule. `observed` is a behaviour seen in a live app, dated,
// and is never presented as Google's rule.

export interface GoogleRule {
  title: string;
  quote: string;
  context?: string;
  observed?: string;
  url: string;
  readOn: string;
}

export const READ_ON = '2026-09-09';

// The device-side pages and the pages behind the K group were read a day later.
export const READ_ON_DEVICE = '2026-09-10';

// The incidents mined from public issue trackers on 2026-09-10 showed four
// failures the catalogue could not name. These are the sentences those rules
// rest on, read the same day.
export const READ_ON_FIELD = '2026-09-10';

// The second measurement (2026-09-13, thirty-five incidents nobody here wrote,
// scored with the rules frozen) left four blind spots worth a rule. These are
// the sentences they rest on, read the day after.
export const READ_ON_SAMPLE = '2026-09-14';

const URLS = {
  rtdn: 'https://developer.android.com/google/play/billing/rtdn-reference',
  subscriptionsv2: 'https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2',
  integrate: 'https://developer.android.com/google/play/billing/integrate',
  subscriptions: 'https://developer.android.com/google/play/billing/subscriptions',
  lifecycle: 'https://developer.android.com/google/play/billing/lifecycle/subscriptions',
  voidedList: 'https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list',
  deprecation: 'https://developer.android.com/google/play/billing/deprecation-faq',
  pubsubPush: 'https://docs.cloud.google.com/pubsub/docs/push',
  pubsubOrdering: 'https://docs.cloud.google.com/pubsub/docs/ordering',
  gettingReady: 'https://developer.android.com/google/play/billing/getting-ready',
  permissions: 'https://support.google.com/googleplay/android-developer/answer/9844686',
  subscriptionsV1: 'https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions',
  ordersRefund: 'https://developers.google.com/android-publisher/api-ref/rest/v3/orders/refund',
  billingFlowParams: 'https://developer.android.com/reference/com/android/billingclient/api/BillingFlowParams.Builder',
  testing: 'https://developer.android.com/google/play/billing/test',
  managedPublishing: 'https://support.google.com/googleplay/android-developer/answer/9859654',
  closedTesting: 'https://support.google.com/googleplay/android-developer/answer/14151465',
  productsv2: 'https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2',
  errors: 'https://developer.android.com/google/play/billing/errors',
  responseCodes: 'https://developer.android.com/reference/com/android/billingclient/api/BillingClient.BillingResponseCode',
  security: 'https://developer.android.com/google/play/billing/security',
  oneTimeLifecycle: 'https://developer.android.com/google/play/billing/lifecycle/one-time',
  priceChanges: 'https://developer.android.com/google/play/billing/price-changes',
  migrate8: 'https://developer.android.com/google/play/billing/migrate-gpblv8',
  refundHelp: 'https://support.google.com/googleplay/android-developer/answer/2741495',
  billingClient: 'https://developer.android.com/reference/com/android/billingclient/api/BillingClient',
} as const;

const MUST_CALL_API =
  'You must call the Google Play Developer API after receiving Real-time developer notifications to get the complete status and update your own backend state. These notifications tell you only that the purchase state changed. They do not give you complete information about the purchase.';

const MESSAGE_ID =
  "The messageId field is a unique identifier for the notification. However, it's recommend that you check the uniqueness of these IDs to avoid processing duplicate notifications and making redundant backend API calls";

const THREE_DAYS =
  "must be done within three days so that the purchase isn't automatically refunded and entitlement revoked.";

const PUSH_CODES = 'To acknowledge the message, return one of the following status codes: 102, 200, 201, 202, 204';

const PUSH_RESEND =
  'To send a negative acknowledgment for the message, return any other status code. If you send a negative acknowledgment or the acknowledgment deadline expires, Pub/Sub resends the message.';

const AT_LEAST_ONCE = 'Pub/Sub delivers each message at least once';

const PII_CLEARTEXT =
  'Do not use this field to store any Personally Identifiable Information (PII) such as emails in cleartext. Storing PII in this field results in purchases being blocked.';

export const GOOGLE_RULES: Record<string, GoogleRule> = {
  // ---- A. Configuration and permissions ----
  A1: {
    title: 'Getting ready: configure real-time developer notifications',
    quote:
      'Add the service account google-play-developer-notifications@system.gserviceaccount.com, and grant it the role of Pub/Sub Publisher.',
    context:
      'The page adds: "Cloud Pub/Sub requires that you grant Google Play privileges to publish notifications to your topic." Without that grant nothing is published, so purchases produce no notification at all.',
    url: URLS.gettingReady,
    readOn: READ_ON,
  },
  A2: {
    title: 'Play Console permissions',
    quote: 'Access to the Purchases API',
    context:
      'Listed as a right of the "View financial data, orders, and cancellation data survey responses" permission. "Manage orders and subscriptions" grants "View orders", "Refund orders" and "Cancel subscriptions". A service account without the first cannot read purchases; without the second it cannot act on them. Google answers 401 or 403.',
    url: URLS.permissions,
    readOn: READ_ON,
  },
  A3: {
    title: 'Getting ready: real-time developer notifications per app',
    quote:
      'you can choose to use the same GCP project as the one used to access the Play Developer API, or you can create a new GCP project for each app.',
    context:
      'Nothing forbids the topic living in another project. It is the single most common reason a second engineer cannot find it.',
    url: URLS.gettingReady,
    readOn: READ_ON,
  },
  A4: {
    title: 'Pub/Sub push subscriptions: receiving messages',
    quote: `${PUSH_CODES}. ${PUSH_RESEND}`,
    context: 'Any other status, including 400 for a body the handler could not parse, is a negative acknowledgement and the message comes back.',
    url: URLS.pubsubPush,
    readOn: READ_ON,
  },
  A5: {
    title: 'Pub/Sub push subscriptions: authentication',
    quote:
      'If a push subscription uses authentication, the Pub/Sub service signs a JWT and sends the JWT in the authorization header of the push request.',
    context: `Without authentication the endpoint accepts any body. Re-fetching from Google makes a forged body harmless, which the RTDN reference requires anyway: "${MUST_CALL_API}"`,
    url: URLS.pubsubPush,
    readOn: READ_ON,
  },
  A6: {
    title: 'Play Billing Library deprecation FAQ',
    quote:
      'By Aug 31, 2026, all new apps and updates to existing apps must use Billing Library version 8 or later. If you need more time to update your app, you can request an extension until Nov 1, 2026.',
    context: 'The same page: "existing apps still work, but new apps and updates must use supported versions." Version 8 has its own gate on Aug 31, 2027.',
    url: URLS.deprecation,
    readOn: READ_ON,
  },

  // ---- B. Purchase and acknowledgement ----
  B1: {
    title: 'Integrate the library: acknowledging purchases',
    quote: THREE_DAYS,
    context: 'The full sentence: acknowledging the purchase "must be done within three days so that the purchase isn\'t automatically refunded and entitlement revoked."',
    url: URLS.integrate,
    readOn: READ_ON,
  },
  B2: {
    title: 'Integrate the library: pending transactions',
    quote:
      "You should acknowledge a purchase only when the state is PURCHASED. That is, don't acknowledge it while a purchase is in PENDING state. The three-day acknowledgement window begins only when the purchase state transitions from 'PENDING' to 'PURCHASED'.",
    url: URLS.integrate,
    readOn: READ_ON,
  },
  B3: {
    title: 'Integrate the library: pending transactions',
    quote:
      "Your app shouldn't grant entitlement to these types of purchases until Google notifies you that the user's payment method was successfully charged.",
    url: URLS.integrate,
    readOn: READ_ON,
  },
  B4: {
    title: 'Integrate the library: acknowledging purchases',
    quote: "All initial subscription purchases need to be acknowledged. Subscription renewals don't need to be acknowledged.",
    url: URLS.integrate,
    readOn: READ_ON,
  },
  B5: {
    title: 'Integrate the library: consuming purchases',
    quote:
      'These methods also enable your app to make the one-time product corresponding to the input purchase token available for repurchase.',
    context: 'Said of consumeAsync() and purchases.products:consume. Acknowledging fulfils the three-day requirement but does not make the product available for repurchase, so a consumable that is only acknowledged cannot be bought again.',
    url: URLS.integrate,
    readOn: READ_ON,
  },
  B6: {
    title: 'Integrate the library: processing purchases',
    quote: 'Only after verifying the purchase should your app continue to process the purchase and grant entitlements to the user',
    url: URLS.integrate,
    readOn: READ_ON,
  },
  B7: {
    title: 'Pub/Sub delivery and the RTDN messageId',
    quote: `${AT_LEAST_ONCE}. ${MESSAGE_ID}`,
    context:
      'Google delivers at least once and tells you to de-duplicate; nothing at Google stops a second grant for the same purchase. A double grant of a consumable cannot be rolled back.',
    observed: 'Seen in a live app, 2026-08: a granted purchase whose acknowledgement timed out; a client retry would have granted a second time. Fixed with a two-flag ledger (granted, acknowledged).',
    url: URLS.pubsubOrdering,
    readOn: READ_ON,
  },
  B8: {
    title: 'Integrate the library: acknowledging purchases',
    quote: THREE_DAYS,
    context: 'The three-day clock started at purchase and does not stop because the client was told the acknowledgement succeeded.',
    url: URLS.integrate,
    readOn: READ_ON,
  },
  B9: {
    title: 'Subscriptions: prepaid plans',
    quote:
      'Prepaid plans with a duration of one week or longer must be acknowledged within three days. Prepaid plans with a duration shorter than one week must be acknowledged within half the plan duration.',
    context:
      'The page also says: "Both the initial purchase and any top-ups need to be acknowledged." And it warns: "If a user on a prepaid plan purchases a top-up, and you do not acknowledge the purchase within the corresponding period, the top-up purchase is revoked, the remaining subscription is revoked and canceled, and the user is issued a refund."',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },

  // ---- C. Notifications ----
  C1: {
    title: 'RTDN reference: the push message',
    quote: MESSAGE_ID,
    context: `Pub/Sub: "${AT_LEAST_ONCE}". The same messageId applied twice is the same notification applied twice.`,
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  C2: {
    title: 'Pub/Sub ordering, and the RTDN reference',
    quote: 'Messages with an empty ordering key are not ordered',
    context: `Notifications can arrive out of order. The RTDN reference: "${MUST_CALL_API}" State comes from the API at the time of handling, not from the order of arrival.`,
    url: URLS.pubsubOrdering,
    readOn: READ_ON,
  },
  C3: {
    title: 'RTDN reference',
    quote: MUST_CALL_API,
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  C4: {
    title: 'Pub/Sub push subscriptions, and the RTDN messageId',
    quote: `${PUSH_RESEND}`,
    context: `The messageId is what makes a redelivery recognisable ("${MESSAGE_ID}"). A notification that carries none cannot be de-duplicated: acknowledge it and re-fetch, never revoke on it alone.`,
    url: URLS.pubsubPush,
    readOn: READ_ON,
  },
  C5: {
    title: 'RTDN reference: SubscriptionNotification types',
    quote:
      '(17) SUBSCRIPTION_ITEMS_CHANGED - An item in a subscription bundle has been changed. (18) SUBSCRIPTION_CANCELLATION_SCHEDULED - A cancellation for an installment subscription has been scheduled to take effect at the end of the commitment period. (19) SUBSCRIPTION_PRICE_CHANGE_UPDATED - A subscription item\'s price change details are updated. (20) SUBSCRIPTION_PENDING_PURCHASE_CANCELED - A pending transaction of a subscription has been canceled. (22) SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED - A subscription\'s consent period for price step-up has begun or the user has provided consent for the price step-up.',
    context: 'A type the handler does not switch on is a state change nobody applied.',
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  C6: {
    title: 'RTDN reference: PendingRefundReviewNotification',
    quote:
      'you should evaluate the request and provide a refund suggestion and purchase usage evidence within 24 hours by calling the ReviewRefund API.',
    context: 'A review is a question, not a refund. Access changes when a voidedPurchaseNotification says the money went back, and not before.',
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  C7: {
    title: 'Getting ready: real-time developer notifications; RTDN reference: TestNotification',
    quote: 'Click Send Test Message to send a test message.',
    context: 'The TestNotification carries one field, version. It is sent from the Play Console and proves delivery; it is not a purchase event.',
    url: URLS.gettingReady,
    readOn: READ_ON,
  },

  // ---- D. State interpretation ----
  D1: {
    title: 'Subscription lifecycle: handling state changes',
    quote:
      'Call the purchases.subscriptionsv2.get() method at the RTDN time instead of the expiry time to get a more accurate status of the subscription.',
    context: 'expiryTime on each line item is "Time at which the subscription expired or will expire unless the access is extended." The notification time is when the event happened, not when access ends.',
    url: URLS.lifecycle,
    readOn: READ_ON,
  },
  D2: {
    title: 'Subscription lifecycle: cancellations',
    quote:
      'When a subscription is canceled, the user retains access to the content until the end of the current billing cycle. When the billing cycle ends, access should be revoked.',
    context: 'The API: SUBSCRIPTION_STATE_CANCELED is "Subscription is canceled but not expired yet."',
    url: URLS.lifecycle,
    readOn: READ_ON,
  },
  D3: {
    title: 'Subscription lifecycle: grace period',
    quote: 'During a grace period, the user should still have access to their subscription entitlement.',
    url: URLS.lifecycle,
    readOn: READ_ON,
  },
  D4: {
    title: 'Subscription lifecycle: account hold',
    quote: 'When a subscription enters account hold, you should block access to the subscription entitlement.',
    url: URLS.lifecycle,
    readOn: READ_ON,
  },
  D5: {
    title: 'Subscription lifecycle: pause',
    quote:
      "When a user's subscription is paused, the Play Billing Library doesn't return the subscription through the queryPurchasesAsync() method unless the includeSuspendedSubscriptions parameter is set to true in the QueryPurchasesParams. If the subscription is resumed, the queryPurchasesAsync() method returns it again.",
    context: 'A paused subscription is not a live entitlement; pausedStateContext.autoResumeTime is "Time at which the subscription will be automatically resumed."',
    url: URLS.lifecycle,
    readOn: READ_ON,
  },
  D6: {
    title: 'purchases.subscriptionsv2: SubscriptionState',
    quote: 'SUBSCRIPTION_STATE_EXPIRED: Subscription is expired.',
    context: 'The lifecycle page on cancellations: "When the billing cycle ends, access should be revoked."',
    url: URLS.subscriptionsv2,
    readOn: READ_ON,
  },
  D7: {
    title: 'purchases.subscriptionsv2: SubscriptionPurchaseLineItem',
    quote: 'Time at which the subscription expired or will expire unless the access is extended.',
    context: 'That is the description of expiryTime, a field of each line item, not of the subscription. A subscription with add-ons carries several items, each with its own expiry.',
    url: URLS.subscriptionsv2,
    readOn: READ_ON,
  },
  D8: {
    title: 'purchases.subscriptions (v1)',
    quote: 'Deprecated: Use SubscriptionPurchaseV2 instead.',
    context: 'The v1 resource lists only acknowledge, and cancel and defer marked deprecated. subscriptionsv2 carries get, cancel, defer and revoke.',
    url: URLS.subscriptionsV1,
    readOn: READ_ON,
  },
  D9: {
    title: 'purchases.subscriptionsv2: testPurchase',
    quote: 'Only present if this subscription purchase is a test purchase.',
    context: 'Testing page: "License testers have access to test payment methods that avoid charging the testers real money for purchases." The marker exists to be excluded.',
    url: URLS.subscriptionsv2,
    readOn: READ_ON,
  },
  D10: {
    title: 'Subscriptions: prepaid plans',
    quote: 'Prepaid plans do not automatically renew upon expiration.',
    context:
      'A top-up is a new purchase: "After a top-up, the following fields in the Purchase result object are updated to reflect the most recent top-up purchase: Order ID, Purchase time, Signature, Purchase token, Acknowledged". Expect a new token that must be acknowledged, not a renewal notification.',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },

  // ---- E. Lifecycle events ----
  E1: {
    title: 'RTDN reference: SubscriptionNotification types',
    quote: '(1) SUBSCRIPTION_RECOVERED - A subscription was recovered from account hold or resumed from pause.',
    context: 'Hold and pause removed access; recovery returns it.',
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  E2: {
    title: 'Subscription lifecycle: restorations',
    quote:
      'A restored subscription uses the same purchase token from when the subscription was canceled. All cancellation fields are cleared from the subscription resource.',
    context: 'The RTDN reference: "(7) SUBSCRIPTION_RESTARTED - User has restored their subscription from Play > Account > Subscriptions. The subscription was canceled but had not expired yet when the user restores."',
    url: URLS.lifecycle,
    readOn: READ_ON,
  },
  E3: {
    title: 'Subscriptions: deferring billing',
    quote: 'Billing can be deferred by as little as one day and by as long as one year per API call.',
    context: 'The RTDN reference: "(9) SUBSCRIPTION_DEFERRED - A subscription\'s recurrence time has been extended." The new expiry is on the resource; re-read it.',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },
  E4: {
    title: 'Subscription lifecycle: grace period and account hold',
    quote:
      'By default, all auto-renewing base plans have grace period enabled. You can adjust the grace period length or disable it from the Google Play Console.',
    context: 'Account hold: "the lengths are automatically calculated. The calculation will be 60 days minus any grace period duration." Both are Console settings per base plan; read the state, not a clock.',
    url: URLS.lifecycle,
    readOn: READ_ON,
  },
  E5: {
    title: 'Subscriptions: installment subscriptions',
    quote:
      'A SUBSCRIPTION_CANCELLATION_SCHEDULED RTDN is sent immediately upon user-initiated cancellation when payments remain for the commitment period. The cancellation is pending and will only take effect at the end of the commitment period.',
    context: '"Installment subscriptions feature is only available in Brazil, France, Italy, and Spain".',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },
  E6: {
    title: 'RTDN reference: SubscriptionNotification types',
    quote:
      '(8) SUBSCRIPTION_PRICE_CHANGE_CONFIRMED (DEPRECATED) - A subscription price change has successfully been confirmed by the user.',
    context: 'Price changes arrive as (19) SUBSCRIPTION_PRICE_CHANGE_UPDATED and (22) SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED.',
    url: URLS.rtdn,
    readOn: READ_ON,
  },

  // ---- F. Upgrades and linked tokens ----
  F1: {
    title: 'Subscriptions: upgrades, downgrades and the linked purchase token',
    quote:
      'Be sure to invalidate the token provided in the linkedPurchaseToken to ensure that the old token is not used to gain access to your services.',
    context: 'The API: linkedPurchaseToken is "The purchase token of the old subscription if this subscription is one of the following: Re-signup of a canceled but non-lapsed subscription; Upgrade/downgrade from a previous subscription."',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },
  F2: {
    title: 'Subscriptions: replacement modes, DEFERRED',
    quote:
      'The subscription item is upgraded or downgraded only when the subscription renews, but the new purchase is issued immediately',
    context: 'And: "The new purchase token is surfaced, so it should be processed at this point taking into account when the replacement is to take place." The new tier starts at the next renewal.',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },
  F3: {
    title: 'Subscriptions: restore and resubscribe',
    quote:
      'The new subscription replaces the old one and renews on the same expiration date. The old subscription is immediately marked as expired.',
    context: 'Said of an in-app re-signup before expiry, which creates a new token linked to the old. Restoring in the Play subscriptions centre "keeps the same subscription and purchase token."',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },
  F4: {
    title: 'Subscriptions: replacement modes, WITH_TIME_PRORATION',
    quote:
      'The subscription item is upgraded or downgraded immediately. Any time remaining is adjusted based on the price difference, and credited toward the new subscription by pushing forward the next billing date.',
    context: 'The next billing date moved; the stored expiry must be re-read from the new token\'s resource.',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },

  // ---- G. Refunds, revocations, voided purchases ----
  G1: {
    title: 'RTDN reference: SubscriptionNotification types',
    quote: '(12) SUBSCRIPTION_REVOKED - A subscription has been revoked from the user before the expiration time.',
    context: 'Subscriptions guide: "When you revoke, the user immediately loses access to the subscription."',
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  G2: {
    title: 'RTDN reference: VoidedPurchaseNotification',
    quote: '(1) REFUND_TYPE_FULL_REFUND - The purchase has been fully voided.',
    context: 'The void is the fact: the money went back.',
    observed:
      'Seen in a live app, 2026-08: after the voided-purchase notification, purchases.subscriptionsv2.get still answered SUBSCRIPTION_STATE_ACTIVE, so "is it still active?" said yes and the refunded account kept its tier. The fix revokes on the void and ignores the state read.',
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  G3: {
    title: 'RTDN reference: VoidedPurchaseNotification',
    quote:
      '(2) REFUND_TYPE_QUANTITY_BASED_PARTIAL_REFUND - The purchase has been partially voided by a quantity-based partial refund, applicable only to multi-quantity purchases. A purchase can be partially voided multiple times.',
    context: 'purchases.productsv2 carries refundableQuantity, the quantity still eligible for refund. When the remaining quantity is refunded the type becomes REFUND_TYPE_FULL_REFUND.',
    url: URLS.rtdn,
    readOn: READ_ON,
  },
  G4: {
    title: 'purchases.voidedpurchases.list: startTime',
    quote:
      'The value of this parameter cannot be older than 30 days and is ignored if a pagination token is set. Default value is current time minus 30 days.',
    context: 'A void whose notification was missed and is older than 30 days cannot be recovered through the API.',
    url: URLS.voidedList,
    readOn: READ_ON,
  },
  G5: {
    title: 'orders.refund: the revoke parameter',
    quote:
      'Whether to revoke the purchased item. If set to true, access to the subscription or in-app item will be terminated immediately. If the item is a recurring subscription, all future payments will also be terminated.',
    context: 'A refund without revoke returns money and leaves access in place. The v1 subscriptions resource is "Deprecated: Use SubscriptionPurchaseV2 instead." and no longer lists refund.',
    url: URLS.ordersRefund,
    readOn: READ_ON,
  },
  G6: {
    title: 'Subscriptions: cancel, refund, and revoke',
    quote: 'When you revoke, the user immediately loses access to the subscription.',
    context: 'The page\'s table: Cancel stops renewal and does not revoke access; Revoke stops renewal and revokes access. A developer cancel leaves the user with the access they paid for until expiryTime.',
    url: URLS.subscriptions,
    readOn: READ_ON,
  },

  // ---- H. Account binding and restore ----
  H1: {
    title: 'purchases.subscriptionsv2: ExternalAccountIdentifiers',
    quote: "An obfuscated version of the id that is uniquely associated with the user's account in your app.",
    context: 'Set with setObfuscatedAccountId at purchase time; it comes back on the resource you fetch for every notification. When the verify call never ran for a token, it is the only link to a user.',
    url: URLS.subscriptionsv2,
    readOn: READ_ON,
  },
  H2: {
    title: 'BillingFlowParams.Builder.setObfuscatedAccountId',
    quote: `${PII_CLEARTEXT} Google Play recommends that you use either encryption or a one-way hash to generate an obfuscated identifier to send to Google Play. This identifier is limited to 64 characters.`,
    context: 'An HMAC-SHA256 hex digest is 64 characters exactly and cannot be reversed without the server secret.',
    url: URLS.billingFlowParams,
    readOn: READ_ON,
  },
  H3: {
    title: 'BillingFlowParams.Builder.setObfuscatedAccountId',
    quote:
      "Specifies an optional obfuscated string that is uniquely associated with the purchaser's user account in your app.",
    context: 'One account, one pseudonym. A token can sit on several rows after an account merge or a family share; the pseudonym Google echoes back names the account that paid, so match on it first.',
    url: URLS.billingFlowParams,
    readOn: READ_ON,
  },
  H4: {
    title: 'Integrate the library: fetching purchases',
    quote:
      "Your app should also call queryPurchasesAsync() in your app's onResume() method to handle purchases that have transitioned to the PURCHASED state while your app was not running.",
    context: 'And on connection: "This can be accomplished by calling queryPurchasesAsync when receiving a successful result to onServiceConnected".',
    url: URLS.integrate,
    readOn: READ_ON,
  },
  H5: {
    title: 'Integrate the library: fetching purchases',
    quote:
      'BillingClient.queryPurchasesAsync() will return suspended subscriptions only if the includeSuspendedSubscriptions parameter is set on QueryPurchasesParams.Builder.',
    url: URLS.integrate,
    readOn: READ_ON,
  },
  H6: {
    title: 'BillingFlowParams.Builder.setObfuscatedAccountId',
    quote:
      'you can use this field to accurately link the purchase to the in-game character, avatar, or the in-app profile that initiated the purchase.',
    context: 'Google binds a purchase to the Google account that paid; which app account it belongs to is the developer\'s decision. Decide it and write it down.',
    url: URLS.billingFlowParams,
    readOn: READ_ON,
  },

  // ---- I. Testing and Console ----
  I1: {
    title: 'Test your integration: test subscription renewals',
    quote: 'test subscriptions can renew a maximum of six times, not counting free trials and introductory periods.',
    context: 'The renewal table: 1 week and 1 month renew every 5 minutes, 3 months every 10, 6 months every 15, 1 year every 30. Test grace period is 5 minutes and account hold 10.',
    url: URLS.testing,
    readOn: READ_ON,
  },
  I2: {
    title: 'purchases.subscriptionsv2: testPurchase',
    quote: 'Only present if this subscription purchase is a test purchase.',
    context: 'Testing page: "License testers have access to test payment methods that avoid charging the testers real money for purchases." A test row in a production table is money that never arrived.',
    url: URLS.subscriptionsv2,
    readOn: READ_ON,
  },
  I3: {
    title: 'Play Console help: managed publishing',
    quote:
      "The changes will be published automatically as soon as they're reviewed and approved by Google unless managed publishing is turned on.",
    context: 'With managed publishing on, an approved change waits in "Changes ready to publish" until someone clicks Publish. Approved is not live.',
    url: URLS.managedPublishing,
    readOn: READ_ON,
  },
  I4: {
    title: 'Play Console help: app testing requirements',
    quote:
      'Google Play requires personal developer accounts created after November 13, 2023, to test their apps before those apps are eligible for distribution on Google Play.',
    context: 'The requirement: "run a closed test for their app with a minimum of 12 testers who have been opted in continuously for at least 14 days." The page does not mention organisation accounts.',
    observed: 'An organisation account was not subject to the rule (confirmed in the Console, 2026-08-01).',
    url: URLS.closedTesting,
    readOn: READ_ON,
  },
  I5: {
    title: 'Integrate the library: processing purchases',
    quote: 'Only after verifying the purchase should your app continue to process the purchase and grant entitlements to the user',
    context: 'Verification succeeded and the grant never landed: the write after the verify call is where fulfilment lives, and a database role that lost its grants fails there silently.',
    observed:
      'Seen in a live app, 2026-08: the database role lost its grants after a migration; the verify endpoint reported success and wrote nothing. Fixed with a boot-time preflight that checks the grants.',
    url: URLS.integrate,
    readOn: READ_ON,
  },

  // ---- J. Ledger integrity, retention, redaction ----
  J1: {
    title: 'Pub/Sub delivery and the RTDN messageId',
    quote: `${AT_LEAST_ONCE}. ${MESSAGE_ID}`,
    context: 'At-least-once delivery and client retries both present the same purchase twice. An idempotency key on the grant is what makes the second presentation harmless.',
    url: URLS.pubsubOrdering,
    readOn: READ_ON,
  },
  J2: {
    title: 'purchases.voidedpurchases.list: startTime',
    quote: 'The value of this parameter cannot be older than 30 days',
    context: 'A purchase token is a bearer credential to Google. After the subscription has expired and the voided-purchase window has closed, the raw token has no operational use left; keeping it is the developer\'s choice and a liability.',
    url: URLS.voidedList,
    readOn: READ_ON,
  },
  J3: {
    title: 'BillingFlowParams.Builder.setObfuscatedAccountId',
    quote: PII_CLEARTEXT,
    context: 'Google refuses cleartext personal data in the one field it stores for you. The same standard applies to what leaves your machine: a full purchase token, an email or a user id inside a timeline is not something to paste into an issue or an assistant.',
    url: URLS.billingFlowParams,
    readOn: READ_ON,
  },
  J4: {
    title: 'purchases.subscriptionsv2: expiryTime',
    quote: 'A timestamp in RFC3339 UTC "Zulu" format, with nanosecond resolution and up to nine fractional digits. Examples: "2014-10-02T15:01:23Z"',
    context: 'Google\'s expiry is UTC. A comparison against a local clock is off by the offset at every renewal boundary.',
    url: URLS.subscriptionsv2,
    readOn: READ_ON,
  },

  // ---- K. The device and the Play Billing Library ----
  K1: {
    title: 'BillingResponseCode: ITEM_UNAVAILABLE',
    quote:
      "The requested product is not available for purchase. Please ensure the product is available in the user's country. If you recently changed the country availability and are still receiving this error then it may be because of a propagation delay.",
    context:
      'A catalogue that comes back empty has a short list of causes: the installed build is not the one Play has (a different application id, or a build on no track), the product or base plan is not active, the country is wrong, or the change has not propagated. The errors page adds: "Make sure your app refreshes the product details via queryProductDetailsAsync as recommended."',
    url: URLS.responseCodes,
    readOn: READ_ON_DEVICE,
  },
  K2: {
    title: 'Handle BillingResult response codes: SERVICE_DISCONNECTED',
    quote:
      'This allows the library to automatically attempt to re-establish the connection when a billing API call is made while the service is disconnected, significantly reducing the occurrences of this error.',
    context:
      'Said of automatic service reconnection, which the page recommends enabling. The connection also drops on its own when the Play Store updates itself in the background, so a call made before the first connection completes fails the same way.',
    url: URLS.errors,
    readOn: READ_ON_DEVICE,
  },
  K3: {
    title: 'Handle BillingResult response codes: ITEM_ALREADY_OWNED',
    quote:
      "Call BillingClient.queryPurchasesAsync() after getting an ITEM_ALREADY_OWNED to check if the user has acquired the product, and if it's not the case implement a simple retry logic to reattempt the purchase.",
    context:
      'The reference adds that the cause is often a purchase that was never consumed or never acknowledged, or stale purchase information cached on the device by Play.',
    url: URLS.errors,
    readOn: READ_ON_DEVICE,
  },
  K4: {
    title: 'Handle BillingResult response codes: avoiding ITEM_ALREADY_OWNED',
    quote: "To avoid this error happening when the cause is not a cache issue, don't offer a product for purchase when the user already owns it.",
    url: URLS.errors,
    readOn: READ_ON_DEVICE,
  },
  K5: {
    title: 'Handle BillingResult response codes: retrying',
    quote: 'When a call to a Play Billing Library method returns a BillingResponseCode value that indicates a recoverable condition, you should retry the call.',
    context:
      'The page lists NETWORK_ERROR, SERVICE_TIMEOUT, SERVICE_DISCONNECTED, SERVICE_UNAVAILABLE, BILLING_UNAVAILABLE, ERROR, ITEM_ALREADY_OWNED and ITEM_NOT_OWNED as recoverable, and FEATURE_NOT_SUPPORTED, USER_CANCELED, ITEM_UNAVAILABLE and DEVELOPER_ERROR as not. On ERROR: "Sometimes internal Google Play problems that lead to ERROR are transient, and a retry with an exponential backoff can be implemented for mitigation."',
    url: URLS.errors,
    readOn: READ_ON_DEVICE,
  },
  K6: {
    title: 'BillingResponseCode: DEVELOPER_ERROR',
    quote:
      'Error resulting from incorrect usage of the API. Examples where this error may occur: Invalid arguments such as providing an empty product list where required. Misconfiguration of the app such as not signing the app or not having the necessary permissions in the manifest.',
    context: 'The errors page adds: "Make sure that you are correctly using the different Play Billing Library calls. Also, check the debug message for more info about the error." It is not retriable; retrying hides the mistake.',
    url: URLS.responseCodes,
    readOn: READ_ON_DEVICE,
  },
  K7: {
    title: 'Handle BillingResult response codes: BILLING_UNAVAILABLE',
    quote: 'Automatic retries are unlikely to help in this case. However, a manual retry can help if the user addresses the condition that caused the issue.',
    context:
      'The reference lists the causes: the Play Store app is out of date, the user is in an unsupported country, an enterprise administrator has disabled purchases, or Google Play cannot charge the payment method. The page also says to call isFeatureSupported() before using a feature.',
    url: URLS.errors,
    readOn: READ_ON_DEVICE,
  },
  K8: {
    title: 'Integrate the library: product details',
    quote: 'Caching ProductDetails objects is not recommended, as stale objects can cause launchBillingFlow() failures.',
    url: URLS.integrate,
    readOn: READ_ON_DEVICE,
  },
  K9: {
    title: 'Integrate the library: one connection',
    quote:
      "It's recommended that you have one active BillingClient connection open at one time to avoid multiple PurchasesUpdatedListener callbacks for a single event.",
    url: URLS.integrate,
    readOn: READ_ON_DEVICE,
  },
  K10: {
    title: 'Security: verification belongs on the backend',
    quote:
      'A special case of sensitive data and logic that should be handled in the backend is purchase verification and acknowledgement',
    context:
      'A purchase the device completed and the backend never saw is money taken with nothing recorded. The integration guide is why it happens and how to catch it: queryPurchasesAsync on connection and on resume covers "network loss during purchase" and purchases completed while the app was not running.',
    url: URLS.security,
    readOn: READ_ON_DEVICE,
  },
  K11: {
    title: 'Integrate the library: one connection',
    quote:
      "It's recommended that you have one active BillingClient connection open at one time to avoid multiple PurchasesUpdatedListener callbacks for a single event.",
    context: 'Overlapping catalogue queries are the same family of problem: two answers in flight, and the one that arrives last wins regardless of which is newer.',
    observed:
      'Seen in a live app, 2026-08: the native client did not handle concurrent product queries reliably, so app launch, shop mount, sign-in and resume raced each other. The fix was a single shared query and a generation number, so a late smaller answer can never overwrite a newer one.',
    url: URLS.integrate,
    readOn: READ_ON_DEVICE,
  },
  K12: {
    title: 'purchases.subscriptionsv2: line item product id',
    quote: "The purchased product ID (for example, 'monthly001').",
    context:
      'The product id is on the line item. The base plan id lives under offerDetails and names the plan, not the product. Some wrappers surface the base plan id as the identifier, so a catalogue keyed on it silently fails to find anything.',
    observed:
      'Seen in a live app, 2026-08: the plugin returned the base plan id as the identifier for subscriptions and the product id in a separate field, so the store had to map back before it could price anything.',
    url: URLS.subscriptionsv2,
    readOn: READ_ON_DEVICE,
  },
  K13: {
    title: 'BillingResponseCode: BILLING_UNAVAILABLE',
    quote:
      "A user billing error occurred during processing. Examples where this error may occur: The Play Store app on the user's device is out of date. The user is in an unsupported country.",
    context: 'A browser has no Play Store at all. A wrapper whose web fallback resolves with nothing rather than failing turns a money path into a silent no-op.',
    observed:
      'Seen in a live app, 2026-08: the plugin stub in a browser resolved with nothing instead of failing, so the shop appeared to buy something and granted nothing. The fix makes the web path throw.',
    url: URLS.responseCodes,
    readOn: READ_ON_DEVICE,
  },
  K14: {
    title: 'BillingResponseCode: USER_CANCELED',
    quote: 'Transaction was canceled by the user.',
    context:
      'The errors page lists USER_CANCELED among the codes that are not retriable. A cancellation is an outcome, not a failure, and retrying it or showing it as an error is a self-inflicted support ticket.',
    observed:
      'Seen in a live app, 2026-08: the wrapper reported a cancellation in two different shapes and only one was recognised, so the unrecognised path surfaced a raw purchase token in an alert.',
    url: URLS.responseCodes,
    readOn: READ_ON_DEVICE,
  },

  // ---- additions to the existing groups ----
  A7: {
    title: 'One-time purchase lifecycle: notifications',
    quote:
      'One-time purchase real-time developer notifications are only published if you have opted into them while configuring real-time developer notifications.',
    context: 'The Console offers a narrower and a wider setting. With the narrower one, a one-time product can be bought, cancelled or refunded and nothing is ever published.',
    url: URLS.oneTimeLifecycle,
    readOn: READ_ON_DEVICE,
  },
  B10: {
    title: 'Integrate the library: multi-quantity purchases',
    quote: 'Your app is expected to handle multi-quantity purchases and grant entitlement based on the specified purchase quantity.',
    context: 'The quantity is on the purchase: getQuantity() on the device, and the quantity field on the Developer API resource.',
    url: URLS.integrate,
    readOn: READ_ON_DEVICE,
  },
  B11: {
    title: 'Subscription lifecycle: plan changes',
    quote:
      'Before offering upgrade, downgrade, or resubscribe options to a user in your app, you must acknowledge the existing subscription. Any plan change or resubscribe is blocked if the existing subscription is still pending acknowledgement.',
    url: URLS.lifecycle,
    readOn: READ_ON_DEVICE,
  },
  C8: {
    title: 'Pub/Sub push subscriptions, and the RTDN reference',
    quote:
      'To send a negative acknowledgment for the message, return any other status code. If you send a negative acknowledgment or the acknowledgment deadline expires, Pub/Sub resends the message.',
    context:
      'A handler that answers a failing status never acknowledges the message, so Pub/Sub redelivers it for as long as the subscription retains it, and the state change it carried is never applied. One refund becomes a week of retries while the entitlement stands.',
    url: URLS.pubsubPush,
    readOn: READ_ON_DEVICE,
  },
  D11: {
    title: 'Subscription lifecycle: the purchase token',
    quote:
      'The purchase token is valid from subscription signup until 60 days after expiration. After this date, the purchase token is no longer valid to use to call the Google Play Developer API.',
    url: URLS.lifecycle,
    readOn: READ_ON_DEVICE,
  },
  E7: {
    title: 'Subscription lifecycle: pause',
    quote:
      'A SubscriptionNotification message with type SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED is sent when your user initiates a pause of their subscription. At this time, the user should keep access to their subscription until the next renewal date',
    context: 'The pause is scheduled, not in effect. Access ends when SUBSCRIPTION_PAUSED arrives and the state reads PAUSED.',
    url: URLS.lifecycle,
    readOn: READ_ON_DEVICE,
  },
  E8: {
    title: 'Change subscription prices: opt-in increases',
    quote: 'If the user doesn\'t act and they reach the first renewal that the opt-in price will apply to, their subscription is automatically canceled and expired on that renewal date.',
    context: 'That cancellation is a price decision, not the user walking away. Counting it as voluntary churn hides the cause of the loss.',
    url: URLS.priceChanges,
    readOn: READ_ON_DEVICE,
  },
  F5: {
    title: 'Subscription lifecycle: resubscribing outside the app',
    quote:
      'The purchase status for this type of out-of-app purchase does not include a linkedPurchaseToken associated with the original purchase in that case, because the original subscription expired completely.',
    context:
      'The link is elsewhere: outOfAppPurchaseContext carries expiredPurchaseToken, the token of the last expired subscription, and expiredExternalAccountIdentifiers, the obfuscated ids that were set on it. It is present only on an unacknowledged resubscribe, so it must be read before acknowledging.',
    url: URLS.lifecycle,
    readOn: READ_ON_DEVICE,
  },
  F6: {
    title: 'Subscriptions: upgrades and downgrades',
    quote: 'If the old subscription was created using an obfuscated account ID, that same ID should be passed to the BillingFlowParams for upgrades and downgrades.',
    url: URLS.subscriptions,
    readOn: READ_ON_DEVICE,
  },
  G7: {
    title: 'Play Console help: refund a subscription order',
    quote: 'Refund only: If you refund an older order in a subscription, the order is refunded and the subscription remains active.',
    context: 'Only refunding the most recent order removes the subscription and cancels future renewals. Refunding an older one returns money and changes nothing else.',
    url: URLS.refundHelp,
    readOn: READ_ON_DEVICE,
  },
  I6: {
    title: 'Test your integration: license testers',
    quote:
      'For purchases from license testers, a purchase will be refunded after 3 minutes if your app does not acknowledge the purchase and you will receive an email about the cancellation.',
    context: 'Three minutes in testing, three days in production. A broken acknowledgement path therefore looks like a mysterious instant refund on a test device, and like nothing at all until real money is involved.',
    url: URLS.testing,
    readOn: READ_ON_DEVICE,
  },
  J5: {
    title: 'Security: use the purchase token as the key',
    quote:
      "Don't use orderId to check for duplicate purchases or as a primary key in your database, as not all purchases generate an orderId. In particular, purchases made with promo codes don't generate an orderId.",
    context: 'The same page: "purchaseToken is globally unique, so you can safely use this value as a primary key in your database."',
    url: URLS.security,
    readOn: READ_ON_DEVICE,
  },
  B12: {
    title: 'purchases.subscriptionsv2: acknowledgementState',
    quote: 'ACKNOWLEDGEMENT_STATE_PENDING: The subscription is not acknowledged yet.',
    context:
      "The resource is the record of whether Google considers the purchase acknowledged. A wrapper reporting success is reporting its own call, not Google's answer, and the two come apart exactly when it matters.",
    url: URLS.subscriptionsv2,
    readOn: READ_ON_FIELD,
  },
  B13: {
    title: 'Integrate the library: handling pending transactions',
    quote:
      'If the purchase is in PENDING state, your app should notify the user that they still need to complete actions to complete the purchase before entitlement is granted. Only grant entitlement when the purchase transitions from PENDING to PURCHASED.',
    context:
      'A purchase seen once as PENDING and never seen again means nothing picked up the transition. The three-day acknowledgement clock starts at that transition, so it runs while nobody is watching.',
    url: URLS.integrate,
    readOn: READ_ON_FIELD,
  },
  F7: {
    title: 'Subscriptions: replacing an existing subscription',
    quote:
      'The existing purchase level update params BillingFlowParams.setSubscriptionUpdateParams() should be constructed with setOldPurchaseToken().',
    context:
      'A plan change launched without the token of the subscription it replaces is not a replacement. Google treats it as an unrelated new purchase, the old one keeps renewing, and the user pays twice.',
    url: URLS.subscriptions,
    readOn: READ_ON_FIELD,
  },
  K15: {
    title: 'Integrate the library: process all purchases',
    quote: 'you must call BillingClient.queryPurchasesAsync() to ensure your app processes all purchases.',
    context:
      'When Google holds a purchase and the device query returns nothing, the app cannot process what it cannot see. The purchase is real, the entitlement is missing, and buying again is refused as already owned.',
    url: URLS.integrate,
    readOn: READ_ON_FIELD,
  },

  // ---- Read after the second measurement: the four blind spots it left ----

  B14: {
    title: 'Integrate the library: acknowledging purchases',
    quote: THREE_DAYS,
    context:
      "B1 sees the refund arrive; this rule sees the window close with nothing acknowledged and nothing recorded either way, which on a timeline with no server events is all a reporter has. The full sentence: acknowledging the purchase \"must be done within three days so that the purchase isn't automatically refunded and entitlement revoked.\"",
    url: URLS.integrate,
    readOn: READ_ON_SAMPLE,
  },
  F8: {
    title: 'Subscriptions: replacement modes, CHARGE_PRORATED_PRICE',
    quote: 'This option is available only for a subscription item upgrade, where the price per unit of time increases.',
    context:
      'A note under the mode in the replacement modes table, which describes it as: "The subscription item is upgraded immediately, and the billing cycle remains the same. The price difference for the remaining period is then charged to the user." A plan that is cheaper per unit of time is not an upgrade in this sense. Google does not say how the refusal is reported; the reporter in the 2026-09-13 sample saw SERVICE_UNAVAILABLE with DF-DFERH-01, which is what the rule reads.',
    url: URLS.subscriptions,
    readOn: READ_ON_SAMPLE,
  },
  K16: {
    title: 'BillingClient: queryPurchasesAsync',
    quote: 'Only active subscriptions and non-consumed one-time purchases are returned.',
    context:
      'The 8.0.0 release notes, 2025-06-30: "The queryPurchaseHistory() method that was previously marked as deprecated has now been removed." The page they point to says what replaces it: "If your app would like to track a user\'s purchase history your app should keep track of the history on your apps backend."',
    url: URLS.billingClient,
    readOn: READ_ON_SAMPLE,
  },
  K17: {
    title: 'Handle BillingResult response codes: ITEM_UNAVAILABLE',
    quote:
      "To be available for purchase, a product needs to be active, its app needs to be published, and its app needs to be available in the user's country.",
    context:
      'The same entry: "Sometimes, in particular during testing, everything is correct in the product configuration, but users still see this error. This might be due to a propagation delay of the product details across Google\'s servers. Try again later." K1 reads this code off an empty catalogue query; this rule reads it off the purchase flow.',
    url: URLS.errors,
    readOn: READ_ON_SAMPLE,
  },
};

// Look a rule's Google fact up. Throws for an unknown id on purpose: a rule
// without a documentation quote must not run.
export function googleRule(ruleId: string): GoogleRule {
  const rule = GOOGLE_RULES[ruleId];
  if (!rule) {
    throw new Error(`no Google rule recorded for ${ruleId}; a rule without a documentation quote does not ship`);
  }
  return rule;
}
