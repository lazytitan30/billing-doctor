// Real-time developer notifications: the type table and a decoder for Pub/Sub
// push bodies. Numbers and names are Google's, read on 2026-09-09 from the RTDN
// reference (src/google/docs.ts carries the URL). The decoder never trusts the
// body beyond parsing it; what the caller must do next is always "re-fetch".

export interface NotificationTypeInfo {
  value: number;
  name: string;
  meaning: string;
  deprecated?: boolean;
}

// SubscriptionNotification.notificationType. Values 14, 15, 16 and 21 do not exist.
export const SUBSCRIPTION_NOTIFICATION_TYPES: Record<number, NotificationTypeInfo> = {
  1: { value: 1, name: 'SUBSCRIPTION_RECOVERED', meaning: 'recovered from account hold or resumed from pause' },
  2: { value: 2, name: 'SUBSCRIPTION_RENEWED', meaning: 'an active subscription renewed' },
  3: { value: 3, name: 'SUBSCRIPTION_CANCELED', meaning: 'cancelled, voluntarily or involuntarily; access continues until expiry' },
  4: { value: 4, name: 'SUBSCRIPTION_PURCHASED', meaning: 'a new subscription was purchased' },
  5: { value: 5, name: 'SUBSCRIPTION_ON_HOLD', meaning: 'entered account hold; the user loses access' },
  6: { value: 6, name: 'SUBSCRIPTION_IN_GRACE_PERIOD', meaning: 'entered grace period; the user keeps access' },
  7: { value: 7, name: 'SUBSCRIPTION_RESTARTED', meaning: 'the user restored a cancelled subscription from the Play subscriptions centre; same token' },
  8: {
    value: 8,
    name: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
    meaning: 'deprecated; price changes now arrive as 19 and 22',
    deprecated: true,
  },
  9: { value: 9, name: 'SUBSCRIPTION_DEFERRED', meaning: 'the recurrence time was extended; re-read expiryTime' },
  10: { value: 10, name: 'SUBSCRIPTION_PAUSED', meaning: 'paused; no access until it resumes' },
  11: { value: 11, name: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED', meaning: 'the pause schedule changed; access unchanged for now' },
  12: { value: 12, name: 'SUBSCRIPTION_REVOKED', meaning: 'revoked before the expiration time; access ends now' },
  13: { value: 13, name: 'SUBSCRIPTION_EXPIRED', meaning: 'expired; access ends' },
  17: { value: 17, name: 'SUBSCRIPTION_ITEMS_CHANGED', meaning: 'an item in a subscription bundle changed' },
  18: {
    value: 18,
    name: 'SUBSCRIPTION_CANCELLATION_SCHEDULED',
    meaning: 'installment subscription: the cancellation takes effect at the end of the commitment period',
  },
  19: { value: 19, name: 'SUBSCRIPTION_PRICE_CHANGE_UPDATED', meaning: 'price change details were updated' },
  20: { value: 20, name: 'SUBSCRIPTION_PENDING_PURCHASE_CANCELED', meaning: 'a pending transaction was cancelled; nothing to grant' },
  22: {
    value: 22,
    name: 'SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED',
    meaning: 'a price step-up consent period began or the user consented (regions where consent is required)',
  },
};

export const ONE_TIME_NOTIFICATION_TYPES: Record<number, NotificationTypeInfo> = {
  1: { value: 1, name: 'ONE_TIME_PRODUCT_PURCHASED', meaning: 'a one-time product was purchased' },
  2: { value: 2, name: 'ONE_TIME_PRODUCT_CANCELED', meaning: 'a pending one-time purchase was cancelled by the user' },
};

export const REFUND_TYPES: Record<number, string> = {
  1: 'REFUND_TYPE_FULL_REFUND',
  2: 'REFUND_TYPE_QUANTITY_BASED_PARTIAL_REFUND',
};

export const PRODUCT_TYPES: Record<number, string> = {
  1: 'PRODUCT_TYPE_SUBSCRIPTION',
  2: 'PRODUCT_TYPE_ONE_TIME',
};

export const REFUND_REASONS: Record<number, string> = {
  7: 'CHARGEBACK',
};

export type NotificationKind =
  | 'subscription'
  | 'oneTimeProduct'
  | 'voidedPurchase'
  | 'pendingRefundReview'
  | 'test';

// The decoded data field of a push message.
export interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: number | string;
  subscriptionNotification?: { version?: string; notificationType?: number; purchaseToken?: string; subscriptionId?: string };
  oneTimeProductNotification?: { version?: string; notificationType?: number; purchaseToken?: string; sku?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  pendingRefundReviewNotification?: {
    version?: string;
    pendingRefundToken?: string;
    orderId?: string;
    refundReason?: number;
    obfuscatedAccountId?: string;
    obfuscatedProfileId?: string;
  };
  testNotification?: { version?: string };
}

export interface DecodedRtdn {
  messageId: string | null;
  publishTime?: string;
  subscription?: string;
  packageName?: string;
  eventTimeMillis?: number;
  eventTime?: string;
  notification: NotificationKind;
  type?: NotificationTypeInfo;
  token?: string;
  sku?: string;
  orderId?: string;
  refundType?: { value: number; name: string };
  productType?: { value: number; name: string };
  pendingRefundToken?: string;
  refundReason?: { value: number; name: string };
  obfuscatedAccountId?: string;
  nextStep: string;
  raw: DeveloperNotification;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Turn the base64 data field into the DeveloperNotification object.
function decodeData(data: string): DeveloperNotification {
  let json: string;
  try {
    json = Buffer.from(data, 'base64').toString('utf8');
  } catch {
    throw new Error('message.data is not valid base64');
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('message.data does not decode to JSON');
  }
  if (!isObject(value)) throw new Error('message.data does not decode to an object');
  return value as DeveloperNotification;
}

// Accepts a Pub/Sub push envelope ({ message: { data, messageId }, subscription }),
// a DeveloperNotification that is already decoded, or the base64 string alone.
export function decodeRtdn(input: unknown): DecodedRtdn {
  let messageId: string | null = null;
  let publishTime: string | undefined;
  let subscription: string | undefined;
  let notification: DeveloperNotification;

  if (typeof input === 'string') {
    notification = decodeData(input.trim());
  } else if (isObject(input) && isObject(input.message)) {
    const message = input.message;
    if (typeof message.data !== 'string') throw new Error('push body has message but no message.data');
    notification = decodeData(message.data);
    messageId = typeof message.messageId === 'string' ? message.messageId : typeof message.message_id === 'string' ? message.message_id : null;
    publishTime = typeof message.publishTime === 'string' ? message.publishTime : typeof message.publish_time === 'string' ? message.publish_time : undefined;
    subscription = typeof input.subscription === 'string' ? input.subscription : undefined;
  } else if (isObject(input)) {
    notification = input as DeveloperNotification;
  } else {
    throw new Error('expected a push envelope, a DeveloperNotification object, or a base64 string');
  }

  const eventTimeMillis =
    notification.eventTimeMillis === undefined ? undefined : Number(notification.eventTimeMillis);
  const eventTime =
    eventTimeMillis !== undefined && Number.isFinite(eventTimeMillis) ? new Date(eventTimeMillis).toISOString() : undefined;

  const base = {
    messageId,
    publishTime,
    subscription,
    packageName: notification.packageName,
    eventTimeMillis: Number.isFinite(eventTimeMillis) ? eventTimeMillis : undefined,
    eventTime,
    raw: notification,
  };

  if (notification.subscriptionNotification) {
    const n = notification.subscriptionNotification;
    const type = n.notificationType === undefined ? undefined : SUBSCRIPTION_NOTIFICATION_TYPES[n.notificationType];
    const typeText = type ? `${type.name} (${type.value})` : `unknown subscription type ${n.notificationType}`;
    return {
      ...base,
      notification: 'subscription',
      type: type ?? (n.notificationType === undefined ? undefined : { value: n.notificationType, name: 'UNKNOWN', meaning: 'not in the reference read on 2026-09-09; handle new types as they appear' }),
      token: n.purchaseToken,
      nextStep: `${typeText}: call purchases.subscriptionsv2.get for the token before touching state. The type says what changed; the resource says what is true now.`,
    };
  }
  if (notification.oneTimeProductNotification) {
    const n = notification.oneTimeProductNotification;
    const type = n.notificationType === undefined ? undefined : ONE_TIME_NOTIFICATION_TYPES[n.notificationType];
    const next =
      n.notificationType === 2
        ? 'a pending purchase was cancelled by the user: nothing to grant, nothing to acknowledge.'
        : 'call purchases.productsv2.get for the token, grant only on PURCHASED, then acknowledge (non-consumable) or consume (consumable) within three days.';
    return {
      ...base,
      notification: 'oneTimeProduct',
      type,
      token: n.purchaseToken,
      sku: n.sku,
      nextStep: `${type ? type.name : 'unknown one-time type'}: ${next}`,
    };
  }
  if (notification.voidedPurchaseNotification) {
    const n = notification.voidedPurchaseNotification;
    const refundType = n.refundType === undefined ? undefined : { value: n.refundType, name: REFUND_TYPES[n.refundType] ?? 'UNKNOWN' };
    const productType = n.productType === undefined ? undefined : { value: n.productType, name: PRODUCT_TYPES[n.productType] ?? 'UNKNOWN' };
    const next =
      n.refundType === 2
        ? 'a quantity-based partial refund on a multi-quantity one-time product: adjust the quantity (productsv2.get carries refundableQuantity); do not revoke the whole purchase.'
        : 'the money went back. Revoke access for this token now; do not wait for subscriptionsv2.get, which can still read ACTIVE afterwards.';
    return {
      ...base,
      notification: 'voidedPurchase',
      token: n.purchaseToken,
      orderId: n.orderId,
      refundType,
      productType,
      nextStep: `voided purchase (${refundType?.name ?? 'refund type unknown'}): ${next}`,
    };
  }
  if (notification.pendingRefundReviewNotification) {
    const n = notification.pendingRefundReviewNotification;
    const refundReason =
      n.refundReason === undefined ? undefined : { value: n.refundReason, name: REFUND_REASONS[n.refundReason] ?? 'UNKNOWN' };
    return {
      ...base,
      notification: 'pendingRefundReview',
      orderId: n.orderId,
      pendingRefundToken: n.pendingRefundToken,
      refundReason,
      obfuscatedAccountId: n.obfuscatedAccountId,
      nextStep:
        'a chargeback is under review: answer through orders.reviewRefund within 24 hours with your preference and usage evidence. Access does not change until a voidedPurchaseNotification arrives.',
    };
  }
  if (notification.testNotification) {
    return {
      ...base,
      notification: 'test',
      nextStep: 'a test notification from the Play Console: delivery works; there is nothing to apply.',
    };
  }
  throw new Error(
    'the notification carries none of subscriptionNotification, oneTimeProductNotification, voidedPurchaseNotification, pendingRefundReviewNotification or testNotification',
  );
}

// Plain lines for the CLI.
export function describeRtdn(decoded: DecodedRtdn): string[] {
  const lines: string[] = [];
  lines.push(`Notification: ${decoded.notification}${decoded.type ? ` ${decoded.type.name} (${decoded.type.value})` : ''}`);
  if (decoded.type) lines.push(`Meaning: ${decoded.type.meaning}${decoded.type.deprecated ? ' [deprecated]' : ''}`);
  if (decoded.packageName) lines.push(`Package: ${decoded.packageName}`);
  if (decoded.eventTime) lines.push(`Event time: ${decoded.eventTime} (eventTimeMillis ${decoded.eventTimeMillis})`);
  lines.push(`Pub/Sub messageId: ${decoded.messageId ?? 'none (cannot de-duplicate a redelivery)'}`);
  if (decoded.publishTime) lines.push(`Published: ${decoded.publishTime}`);
  if (decoded.token) lines.push(`Purchase token: ${decoded.token}`);
  if (decoded.sku) lines.push(`Product: ${decoded.sku}`);
  if (decoded.orderId) lines.push(`Order id: ${decoded.orderId}`);
  if (decoded.refundType) lines.push(`Refund type: ${decoded.refundType.name} (${decoded.refundType.value})`);
  if (decoded.productType) lines.push(`Product type: ${decoded.productType.name} (${decoded.productType.value})`);
  if (decoded.pendingRefundToken) lines.push(`Pending refund token: ${decoded.pendingRefundToken}`);
  if (decoded.refundReason) lines.push(`Refund reason: ${decoded.refundReason.name} (${decoded.refundReason.value})`);
  if (decoded.obfuscatedAccountId) lines.push(`Obfuscated account id: ${decoded.obfuscatedAccountId}`);
  lines.push(`Next step: ${decoded.nextStep}`);
  return lines;
}
