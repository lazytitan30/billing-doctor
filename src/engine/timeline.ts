// The timeline format: billing-doctor-timeline/1.
//
// One JSON file describes what happened to one purchase, or a few related ones:
// what the device reported, what the Google Play Developer API answered, what
// the backend wrote, which notifications arrived, what the user said, and what
// changed in the Console. Every rule reads this shape and nothing else, so this
// file is the contract. The schema is loose about extra fields (developers keep
// their own notes on an event) and strict about the few fields a rule needs.
//
// Times are ISO 8601 with a timezone designator. A bare local time is refused,
// because comparing a UTC expiry with a local clock is one of the rules (J4).

import { z } from 'zod';

export const SCHEMA_ID = 'billing-doctor-timeline/1';

// A time with a Z or an offset. Google's API timestamps are RFC 3339 UTC.
const isoTime = z.iso.datetime({ offset: true });

// Fields every event may carry. `token` is the purchase token as a pseudonym
// (see looksLikePseudonym below); `note` is free text for humans.
const common = {
  t: isoTime,
  token: z.string().optional(),
  note: z.string().optional(),
};

// ---- app: what the device reported -----------------------------------------

export const APP_EVENT_TYPES = [
  'purchase_result', // PurchasesUpdatedListener fired, or the plugin's approved event
  'query_purchases', // queryPurchasesAsync ran
  'app_start', // the app launched
  'app_resume', // the app came to the foreground
  'billing_connected', // BillingClient connected
  'launch_billing_flow', // the purchase or replacement flow was launched
  'acknowledge', // acknowledgePurchase called from the device
  'consume', // consumeAsync called from the device
] as const;

// Purchase.PurchaseState names from the library, plus CANCELLED from productsv2.
export const PURCHASE_STATES = ['PURCHASED', 'PENDING', 'UNSPECIFIED_STATE', 'CANCELLED'] as const;

export const REPLACEMENT_MODES = [
  'WITH_TIME_PRORATION',
  'CHARGE_PRORATED_PRICE',
  'CHARGE_FULL_PRICE',
  'WITHOUT_PRORATION',
  'DEFERRED',
  'KEEP_EXISTING',
] as const;

const appEvent = z.looseObject({
  ...common,
  kind: z.literal('app'),
  type: z.enum(APP_EVENT_TYPES),
  productId: z.string().optional(),
  purchaseState: z.enum(PURCHASE_STATES).optional(),
  // What the app passed as setObfuscatedAccountId. Null means it passed nothing.
  obfuscatedAccountId: z.string().nullable().optional(),
  quantity: z.number().int().positive().optional(),
  // QueryPurchasesParams.includeSuspendedSubscriptions, when known.
  includeSuspendedSubscriptions: z.boolean().optional(),
  // For a replacement: the mode and the token being replaced.
  replacementMode: z.enum(REPLACEMENT_MODES).optional(),
  oldToken: z.string().optional(),
  // Pseudonyms for the Google account that paid and the app account signed in.
  googleAccount: z.string().optional(),
  appAccount: z.string().optional(),
});

// ---- api: a call to the Google Play Developer API and its answer -------------

export const API_CALLS = [
  'subscriptionsv2.get',
  'subscriptions.get', // v1, deprecated
  'productsv2.get',
  'products.get',
  'subscriptions.acknowledge',
  'products.acknowledge',
  'products.consume',
  'subscriptionsv2.cancel',
  'subscriptions.cancel',
  'subscriptionsv2.revoke',
  'subscriptions.revoke',
  'subscriptionsv2.defer',
  'subscriptions.defer',
  'subscriptions.refund',
  'orders.refund',
  'orders.reviewRefund',
  'voidedpurchases.list',
] as const;

export const ACKNOWLEDGEMENT_STATES = [
  'ACKNOWLEDGEMENT_STATE_UNSPECIFIED',
  'ACKNOWLEDGEMENT_STATE_PENDING',
  'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
] as const;

// One SubscriptionPurchaseLineItem. A subscription with add-ons carries several,
// each with its own expiry, which is why the rules never assume lineItems[0].
const lineItem = z.looseObject({
  productId: z.string(),
  expiryTime: isoTime.nullable().optional(),
  // Either may be `true` as shorthand or the object Google returns.
  autoRenewingPlan: z.union([z.boolean(), z.looseObject({})]).optional(),
  prepaidPlan: z.union([z.boolean(), z.looseObject({})]).optional(),
  // On a DEFERRED replacement: the product this item becomes at the next renewal.
  deferredItemReplacement: z.looseObject({ productId: z.string().optional() }).optional(),
});

const apiEvent = z.looseObject({
  ...common,
  kind: z.literal('api'),
  call: z.enum(API_CALLS),
  status: z.number().int(), // the HTTP status Google answered; 0 for a timeout
  productId: z.string().optional(),
  // Fields copied from a subscriptionsv2 resource.
  subscriptionState: z.string().optional(),
  acknowledgementState: z.enum(ACKNOWLEDGEMENT_STATES).optional(),
  // expiryTime is a shorthand for a single line item; lineItems wins when both exist.
  expiryTime: isoTime.nullable().optional(),
  lineItems: z.array(lineItem).optional(),
  linkedPurchaseToken: z.string().nullable().optional(),
  testPurchase: z.boolean().optional(),
  // Null means the resource carried no identifiers at all.
  externalAccountIdentifiers: z
    .looseObject({
      obfuscatedExternalAccountId: z.string().nullable().optional(),
      obfuscatedExternalProfileId: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  pausedStateContext: z.looseObject({ autoResumeTime: isoTime.optional() }).optional(),
  canceledStateContext: z.string().optional(),
  // Fields copied from a products or productsv2 resource.
  purchaseState: z.enum(PURCHASE_STATES).optional(),
  consumptionState: z.string().optional(),
  quantity: z.number().int().optional(),
  refundableQuantity: z.number().int().optional(),
  // For prepaid plans: the plan length, which sets the acknowledgement window.
  planDurationDays: z.number().positive().optional(),
  // orders.refund: whether access was revoked with the refund.
  revoke: z.boolean().optional(),
  // voidedpurchases.list: the startTime the call asked for.
  startTime: isoTime.optional(),
});

// ---- ledger: what the backend wrote -----------------------------------------

export const LEDGER_OPS = [
  'grant', // access granted
  'revoke', // access removed
  'ack', // the backend recorded an acknowledgement
  'consume', // the backend recorded a consumption
  'write', // any other row written
  'expiry', // the stored expiry was set or changed
  'lookup', // the backend looked the token up
  'purge', // the raw token or payload was purged
  'client_response', // what the backend told the client
  'count', // the token was counted in a metric
] as const;

export const EXPIRY_SOURCES = [
  'expiryTime', // lineItems[].expiryTime from the API: the right one
  'eventTimeMillis', // the notification time
  'clock', // now plus something
  'plan_length', // purchase time plus the plan length
  'previous_token', // carried over from the token this one replaced
] as const;

const ledgerEvent = z.looseObject({
  ...common,
  kind: z.literal('ledger'),
  op: z.enum(LEDGER_OPS),
  userId: z.string().optional(),
  tier: z.string().optional(),
  idempotencyKey: z.string().optional(),
  // The Pub/Sub messageId of the notification that drove this write.
  messageId: z.string().optional(),
  // The expiry the backend stored, as written (a string so J4 can inspect it).
  expiry: z.string().optional(),
  expirySource: z.enum(EXPIRY_SOURCES).optional(),
  timezone: z.enum(['utc', 'local']).optional(),
  planType: z.enum(['auto-renewing', 'prepaid']).optional(),
  // How many line items the backend read from the resource.
  lineItemsRead: z.number().int().positive().optional(),
  // For op lookup: how the token was resolved and how many users matched.
  lookup: z.enum(['findOne', 'pseudonym', 'token']).optional(),
  matchedUsers: z.number().int().nonnegative().optional(),
  // For op client_response.
  result: z.enum(['success', 'error']).optional(),
  // For op count.
  metric: z.enum(['revenue', 'entitlements', 'active_subscribers']).optional(),
  // Whether the row is marked as a test purchase.
  test: z.boolean().optional(),
  // The state the backend had read when it wrote this.
  fromState: z.string().optional(),
});

// ---- rtdn: a notification as received ----------------------------------------

export const NOTIFICATION_KINDS = [
  'subscription',
  'oneTimeProduct',
  'voidedPurchase',
  'pendingRefundReview',
  'test',
] as const;

const rtdnEvent = z
  .looseObject({
    ...common,
    kind: z.literal('rtdn'),
    // Which of the five DeveloperNotification members was present. Defaults to
    // 'subscription' when notificationType is given and nothing says otherwise.
    notification: z.enum(NOTIFICATION_KINDS).optional(),
    notificationType: z.number().int().optional(),
    // Null means the push envelope carried no messageId.
    messageId: z.string().nullable().optional(),
    eventTimeMillis: z.number().int().optional(),
    // The HTTP status the endpoint answered.
    endpointStatus: z.number().int().optional(),
    // voidedPurchaseNotification fields.
    refundType: z.union([z.literal(1), z.literal(2)]).optional(),
    productType: z.union([z.literal(1), z.literal(2)]).optional(),
    orderId: z.string().optional(),
    sku: z.string().optional(),
  })
  .refine((e) => e.notification !== undefined || e.notificationType !== undefined, {
    message: 'an rtdn event needs `notification` or `notificationType`',
  });

// ---- support and console --------------------------------------------------------

const supportEvent = z.looseObject({
  ...common,
  kind: z.literal('support'),
  note: z.string(),
});

const consoleEvent = z.looseObject({
  ...common,
  kind: z.literal('console'),
  billingLibrary: z.string().optional(),
  release: z.enum(['created', 'approved', 'published', 'rolled_back']).optional(),
  closedTest: z.looseObject({ testers: z.number().int().nonnegative(), days: z.number().nonnegative() }).optional(),
});

export const eventSchema = z.discriminatedUnion('kind', [
  appEvent,
  apiEvent,
  ledgerEvent,
  rtdnEvent,
  supportEvent,
  consoleEvent,
]);

// ---- top level -----------------------------------------------------------------------

const policySchema = z.looseObject({
  // Which subscription states the backend grants access on, and which it revokes on.
  grantOn: z.array(z.string()).optional(),
  revokeOn: z.array(z.string()).optional(),
  ackWithinHours: z.number().positive().optional(),
  refetchOnEveryNotification: z.boolean().optional(),
  handledNotificationTypes: z.array(z.number().int()).optional(),
  // Whether a job calls voidedpurchases.list inside every 30-day window.
  voidedPurchasesSweep: z.boolean().optional(),
  // Present only when the backend hard-codes these; Google configures them per base plan.
  gracePeriodDays: z.number().optional(),
  accountHoldDays: z.number().optional(),
});

const configSchema = z.looseObject({
  // The Cloud project the service account and the app are assumed to live in.
  project: z.string().optional(),
  rtdn: z
    .looseObject({
      topicProject: z.string().optional(),
      pushEndpointAuth: z.enum(['none', 'oidc', 'shared-secret']).optional(),
    })
    .optional(),
  serviceAccountRoles: z.array(z.string()).optional(),
  console: z
    .looseObject({
      managedPublishing: z.boolean().optional(),
      accountType: z.enum(['personal', 'organisation']).optional(),
      accountCreated: z.string().optional(), // ISO date
    })
    .optional(),
});

export const timelineSchema = z.looseObject({
  schema: z.literal(SCHEMA_ID),
  app: z
    .looseObject({
      packageName: z.string().optional(),
      billingLibrary: z.string().optional(),
      backend: z.string().optional(),
      // What each product is, so a consumable acknowledged rather than consumed can be seen.
      products: z.record(z.string(), z.enum(['subscription', 'consumable', 'non-consumable'])).optional(),
    })
    .optional(),
  policy: policySchema.optional(),
  config: configSchema.optional(),
  events: z.array(eventSchema),
});

export type Timeline = z.infer<typeof timelineSchema>;
export type TimelineEvent = z.infer<typeof eventSchema>;
export type AppEvent = z.infer<typeof appEvent>;
export type ApiEvent = z.infer<typeof apiEvent>;
export type LedgerEvent = z.infer<typeof ledgerEvent>;
export type RtdnEvent = z.infer<typeof rtdnEvent>;
export type SupportEvent = z.infer<typeof supportEvent>;
export type ConsoleEvent = z.infer<typeof consoleEvent>;
export type Policy = z.infer<typeof policySchema>;
export type Config = z.infer<typeof configSchema>;

// ---- validation ---------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  timeline?: Timeline;
}

// Tokens in a timeline are pseudonyms: `tok_` plus a few characters, as
// `billing-doctor redact` produces. Anything else is probably a real purchase
// token, which is a bearer credential and must not be pasted anywhere.
export function looksLikePseudonym(token: string): boolean {
  return /^tok_[A-Za-z0-9_-]{2,24}$/.test(token);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REDACT_HINT = 'run `billing-doctor redact` over the source before sharing this file';

function issuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.map((p) => String(p)).join('.');
}

// Validate a parsed JSON value. Errors mean the file cannot be diagnosed.
// Warnings mean it can, but something in it should not be there.
export function validateTimeline(value: unknown): ValidationResult {
  const parsed = timelineSchema.safeParse(value);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`);
    return { ok: false, errors, warnings: [] };
  }
  const timeline = parsed.data;
  const warnings: string[] = [];

  timeline.events.forEach((event, index) => {
    const tokens: Array<[string, string | null | undefined]> = [
      ['token', event.token],
      ['oldToken', (event as { oldToken?: string }).oldToken],
      ['linkedPurchaseToken', (event as { linkedPurchaseToken?: string | null }).linkedPurchaseToken],
    ];
    for (const [field, token] of tokens) {
      if (typeof token === 'string' && token.length > 0 && !looksLikePseudonym(token)) {
        warnings.push(
          `events[${index}].${field}: "${shorten(token)}" does not look like a tok_ pseudonym; ${REDACT_HINT}`,
        );
      }
    }
    const userId = (event as { userId?: string }).userId;
    if (typeof userId === 'string' && (UUID_RE.test(userId) || EMAIL_RE.test(userId))) {
      warnings.push(`events[${index}].userId: looks like a real user id or email; ${REDACT_HINT}`);
    }
    const accountId = (event as { obfuscatedAccountId?: string | null }).obfuscatedAccountId;
    if (typeof accountId === 'string' && EMAIL_RE.test(accountId)) {
      warnings.push(`events[${index}].obfuscatedAccountId: contains an email address; ${REDACT_HINT}`);
    }
  });

  // Emails anywhere in the file, including notes.
  const text = JSON.stringify(value);
  const email = text.match(EMAIL_RE);
  if (email) {
    warnings.push(`the file contains an email address (${shorten(email[0])}); ${REDACT_HINT}`);
  }

  return { ok: true, errors: [], warnings, timeline };
}

function shorten(s: string): string {
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-3)}` : s;
}

// Parse JSON text and validate it in one step.
export function parseTimeline(text: string): ValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`not valid JSON: ${(err as Error).message}`], warnings: [] };
  }
  return validateTimeline(value);
}

// ---- normalisation --------------------------------------------------------------------

// The defaults a rule assumes when the policy block does not say. Grace period
// and canceled-not-expired grant access under Google's rules; hold, pause and
// expiry do not. A developer whose policy differs writes it down and the rules
// read that instead.
export const DEFAULT_GRANT_ON = [
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
];
export const DEFAULT_REVOKE_ON = [
  'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_EXPIRED',
];
export const DEFAULT_ACK_WITHIN_HOURS = 72;

export type NormalizedEvent = TimelineEvent & {
  i: number; // index in the file, which is what findings cite as evidence
  tMs: number; // t as milliseconds since the epoch
};

export interface ResolvedPolicy extends Policy {
  grantOn: string[];
  revokeOn: string[];
  ackWithinHours: number;
}

export interface NormalizedTimeline {
  raw: Timeline;
  app: NonNullable<Timeline['app']>;
  policy: ResolvedPolicy;
  config: Config;
  events: NormalizedEvent[]; // in time order, ties kept in file order
  byToken: Map<string, NormalizedEvent[]>;
  startMs: number;
  endMs: number;
}

export function normalizeTimeline(timeline: Timeline): NormalizedTimeline {
  const events: NormalizedEvent[] = timeline.events.map((event, i) => {
    const normalized: NormalizedEvent = { ...event, i, tMs: Date.parse(event.t) };
    if (normalized.kind === 'rtdn' && normalized.notification === undefined) {
      normalized.notification = 'subscription';
    }
    return normalized;
  });
  events.sort((a, b) => a.tMs - b.tMs || a.i - b.i);

  const byToken = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    if (!event.token) continue;
    const list = byToken.get(event.token) ?? [];
    list.push(event);
    byToken.set(event.token, list);
  }

  const policy: ResolvedPolicy = {
    ...(timeline.policy ?? {}),
    grantOn: timeline.policy?.grantOn ?? DEFAULT_GRANT_ON,
    revokeOn: timeline.policy?.revokeOn ?? DEFAULT_REVOKE_ON,
    ackWithinHours: timeline.policy?.ackWithinHours ?? DEFAULT_ACK_WITHIN_HOURS,
  };

  return {
    raw: timeline,
    app: timeline.app ?? {},
    policy,
    config: timeline.config ?? {},
    events,
    byToken,
    startMs: events.length ? events[0].tMs : 0,
    endMs: events.length ? events[events.length - 1].tMs : 0,
  };
}

// An empty timeline with the policy block filled in. `billing-doctor init`
// writes this after asking its questions.
export function emptyTimeline(input: {
  packageName?: string;
  backend?: string;
  billingLibrary?: string;
  policy?: Policy;
  config?: Config;
}): Timeline {
  return {
    schema: SCHEMA_ID,
    app: {
      packageName: input.packageName ?? 'com.example.app',
      billingLibrary: input.billingLibrary ?? '8.0.0',
      backend: input.backend ?? 'node',
    },
    policy: {
      grantOn: DEFAULT_GRANT_ON,
      revokeOn: DEFAULT_REVOKE_ON,
      ackWithinHours: DEFAULT_ACK_WITHIN_HOURS,
      ...(input.policy ?? {}),
    },
    config: input.config ?? {},
    events: [],
  };
}
