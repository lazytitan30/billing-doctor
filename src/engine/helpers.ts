// Small questions the rules ask of a timeline. Kept in one place so every rule
// means the same thing by "acknowledged", "granted" or "verified".

import type { NormalizedEvent, NormalizedTimeline } from './timeline.js';

export type Ev = NormalizedEvent;
export type ApiEv = Extract<Ev, { kind: 'api' }>;
export type LedgerEv = Extract<Ev, { kind: 'ledger' }>;
export type RtdnEv = Extract<Ev, { kind: 'rtdn' }>;
export type AppEv = Extract<Ev, { kind: 'app' }>;
export type ConsoleEv = Extract<Ev, { kind: 'console' }>;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

// Does a come before b in the sorted order?
export function precedes(a: Ev, b: Ev): boolean {
  return a.tMs < b.tMs || (a.tMs === b.tMs && a.i < b.i);
}

export function between(events: Ev[], a: Ev, b: Ev): Ev[] {
  return events.filter((e) => precedes(a, e) && precedes(e, b));
}

export function isApi(e: Ev): e is ApiEv {
  return e.kind === 'api';
}
export function isLedger(e: Ev): e is LedgerEv {
  return e.kind === 'ledger';
}
export function isRtdn(e: Ev): e is RtdnEv {
  return e.kind === 'rtdn';
}
export function isApp(e: Ev): e is AppEv {
  return e.kind === 'app';
}

// Any read of a purchase from the Play Developer API.
export function isGet(e: Ev): e is ApiEv {
  return isApi(e) && e.call.endsWith('.get');
}
export function isOkGet(e: Ev): e is ApiEv {
  return isGet(e) && isOk(e.status);
}

// An acknowledgement that reached Google or was recorded: an API call that
// answered 2xx, the device's own call, or the ledger's record of one.
export function isAck(e: Ev): boolean {
  if (isApi(e)) return (e.call === 'subscriptions.acknowledge' || e.call === 'products.acknowledge') && isOk(e.status);
  if (isApp(e)) return e.type === 'acknowledge';
  if (isLedger(e)) return e.op === 'ack';
  return false;
}
export function isConsume(e: Ev): boolean {
  if (isApi(e)) return e.call === 'products.consume' && isOk(e.status);
  if (isApp(e)) return e.type === 'consume';
  if (isLedger(e)) return e.op === 'consume';
  return false;
}
export function isAckOrConsume(e: Ev): boolean {
  return isAck(e) || isConsume(e);
}
// An acknowledgement call to Google, whatever it answered.
export function isAckAttempt(e: Ev): e is ApiEv {
  return isApi(e) && (e.call === 'subscriptions.acknowledge' || e.call === 'products.acknowledge' || e.call === 'products.consume');
}

const STATE_WRITE_OPS = new Set(['grant', 'revoke', 'expiry', 'write']);
const WRITE_OPS = new Set(['grant', 'revoke', 'expiry', 'write', 'ack', 'consume']);

// A write that changes what the user has or when it ends.
export function isStateWrite(e: Ev): e is LedgerEv {
  return isLedger(e) && STATE_WRITE_OPS.has(e.op);
}
export function isLedgerWrite(e: Ev): e is LedgerEv {
  return isLedger(e) && WRITE_OPS.has(e.op);
}
export function isGrant(e: Ev): e is LedgerEv {
  return isLedger(e) && e.op === 'grant';
}
export function isRevoke(e: Ev): e is LedgerEv {
  return isLedger(e) && e.op === 'revoke';
}

// A developer-initiated revocation at Google.
export function isApiRevoke(e: Ev): e is ApiEv {
  return isApi(e) && (e.call === 'subscriptionsv2.revoke' || e.call === 'subscriptions.revoke') && isOk(e.status);
}

export function isPurchaseResult(e: Ev): e is AppEv {
  return isApp(e) && e.type === 'purchase_result';
}

export function isVoided(e: Ev): e is RtdnEv {
  return isRtdn(e) && e.notification === 'voidedPurchase' && e.refundType !== 2;
}
export function isPartialVoid(e: Ev): e is RtdnEv {
  return isRtdn(e) && e.notification === 'voidedPurchase' && e.refundType === 2;
}
export function isSubscriptionNotification(e: Ev, type?: number): e is RtdnEv {
  return isRtdn(e) && e.notification === 'subscription' && (type === undefined || e.notificationType === type);
}
export function isRevokedNotification(e: Ev): e is RtdnEv {
  return isSubscriptionNotification(e, 12);
}

export function tokenEvents(tl: NormalizedTimeline, token: string): Ev[] {
  return tl.byToken.get(token) ?? [];
}

// The purchase state a device or API event reports, in the library's words.
export function purchaseStateOf(e: Ev): string | undefined {
  if (isPurchaseResult(e)) return e.purchaseState;
  if (isOkGet(e)) {
    if (e.purchaseState) return e.purchaseState;
    if (e.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') return 'PENDING';
    if (e.subscriptionState === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') return 'CANCELLED';
    if (e.subscriptionState) return 'PURCHASED';
  }
  return undefined;
}

// The last purchase state reported before an event.
export function lastPurchaseState(events: Ev[], before: Ev): { state: string; event: Ev } | undefined {
  let found: { state: string; event: Ev } | undefined;
  for (const e of events) {
    if (!precedes(e, before)) break;
    const state = purchaseStateOf(e);
    if (state) found = { state, event: e };
  }
  return found;
}

// The last subscription state Google answered before an event.
export function lastSubscriptionState(events: Ev[], before: Ev): { state: string; event: ApiEv } | undefined {
  let found: { state: string; event: ApiEv } | undefined;
  for (const e of events) {
    if (!precedes(e, before)) break;
    if (isOkGet(e) && e.subscriptionState) found = { state: e.subscriptionState, event: e };
  }
  return found;
}

// Is the token granted in the ledger at (just before) this event?
export function grantedBefore(events: Ev[], before: Ev): boolean {
  let granted = false;
  for (const e of events) {
    if (!precedes(e, before)) break;
    if (isGrant(e)) granted = true;
    else if (isRevoke(e)) granted = false;
  }
  return granted;
}

// Is the token granted at the end of the timeline?
export function grantedAtEnd(events: Ev[]): boolean {
  let granted = false;
  for (const e of events) {
    if (isGrant(e)) granted = true;
    else if (isRevoke(e)) granted = false;
  }
  return granted;
}

// The last rtdn event with this messageId that precedes `before`.
export function rtdnBefore(tl: NormalizedTimeline, messageId: string, before: Ev): RtdnEv | undefined {
  let found: RtdnEv | undefined;
  for (const e of tl.events) {
    if (!precedes(e, before)) break;
    if (isRtdn(e) && e.messageId === messageId) found = e;
  }
  return found;
}

export function productOf(tl: NormalizedTimeline, token: string): string | undefined {
  for (const e of tokenEvents(tl, token)) {
    if (isPurchaseResult(e) && e.productId) return e.productId;
    if (isApi(e)) {
      if (e.productId) return e.productId;
      if (e.lineItems?.[0]?.productId) return e.lineItems[0].productId;
    }
  }
  return undefined;
}

export function productTypeOf(tl: NormalizedTimeline, productId: string | undefined): string | undefined {
  return productId ? tl.app.products?.[productId] : undefined;
}

export function isPrepaidGet(e: Ev): boolean {
  return isOkGet(e) && Boolean(e.lineItems?.some((item) => item.prepaidPlan));
}

// The expiry an API answer carries: the latest line item, or the shorthand.
export function expiryOf(e: ApiEv): number | undefined {
  const times = (e.lineItems ?? [])
    .map((item) => (item.expiryTime ? Date.parse(item.expiryTime) : NaN))
    .filter((n) => Number.isFinite(n));
  if (times.length) return Math.max(...times);
  if (e.expiryTime) return Date.parse(e.expiryTime);
  return undefined;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export function hoursBetween(aMs: number, bMs: number): number {
  return Math.round(((bMs - aMs) / HOUR_MS) * 10) / 10;
}

// One line per event, for evidence lists.
export function describeEvent(e: Ev): string {
  const when = iso(e.tMs);
  const token = e.token ? ` ${e.token}` : '';
  switch (e.kind) {
    case 'app':
      return `#${e.i} app ${e.type}${token}${e.purchaseState ? ` ${e.purchaseState}` : ''}${e.productId ? ` ${e.productId}` : ''} (${when})`;
    case 'api': {
      const state = e.subscriptionState ?? e.purchaseState ?? '';
      const ack = e.acknowledgementState ? ` ${e.acknowledgementState.replace('ACKNOWLEDGEMENT_STATE_', 'ack ')}` : '';
      return `#${e.i} api ${e.call}${token} → ${e.status}${state ? ` ${state}` : ''}${ack} (${when})`;
    }
    case 'ledger':
      return `#${e.i} ledger ${e.op}${token}${e.userId ? ` ${e.userId}` : ''}${e.messageId ? ` [${e.messageId}]` : ''} (${when})`;
    case 'rtdn': {
      const type = e.notification === 'subscription' && e.notificationType !== undefined ? ` type ${e.notificationType}` : ` ${e.notification}`;
      const id = e.messageId === null ? ' [no messageId]' : e.messageId ? ` [${e.messageId}]` : '';
      const status = e.endpointStatus !== undefined ? ` answered ${e.endpointStatus}` : '';
      return `#${e.i} rtdn${type}${token}${id}${status} (${when})`;
    }
    case 'support':
      return `#${e.i} support "${e.note}" (${when})`;
    case 'console':
      return `#${e.i} console ${e.note ?? e.release ?? ''}${e.billingLibrary ? ` library ${e.billingLibrary}` : ''} (${when})`;
  }
}
