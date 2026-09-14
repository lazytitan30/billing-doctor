// What the device reported, in one place.
//
// Google's BillingResponseCode is a number, but a Capacitor, Flutter or React
// Native wrapper usually swallows it and throws instead. So a rule asks this
// file "did this call fail with ITEM_ALREADY_OWNED", and it answers from the
// number when there is one and from the wrapper's own words when there is not.
// Guessing from text is weaker evidence, so the caller lowers its confidence.

import { HOUR_MS, isApp, type AppEv, type Ev } from '../helpers.js';

// How old a catalogue query may be before a purchase flow launched from it is
// read as stale (K8) rather than as refused (K17).
export const STALE_DETAILS_MS = 6 * HOUR_MS;

export const RESPONSE_CODES: Record<number, string> = {
  0: 'OK',
  1: 'USER_CANCELED',
  2: 'SERVICE_UNAVAILABLE',
  3: 'BILLING_UNAVAILABLE',
  4: 'ITEM_UNAVAILABLE',
  5: 'DEVELOPER_ERROR',
  6: 'ERROR',
  7: 'ITEM_ALREADY_OWNED',
  8: 'ITEM_NOT_OWNED',
  12: 'NETWORK_ERROR',
  [-1]: 'SERVICE_DISCONNECTED',
  [-2]: 'FEATURE_NOT_SUPPORTED',
  [-3]: 'SERVICE_TIMEOUT',
};

// The errors page splits the codes in two. Retrying the first set can work;
// retrying the second set only hides the cause.
export const RETRIABLE = new Set([2, 3, 6, 7, 8, 12, -1, -3]);
export const NOT_RETRIABLE = new Set([1, 4, 5, -2]);

// Wrapper wording, in the order it should be tested: the most specific first,
// so "item not owned" is never read as "network".
const FROM_TEXT: Array<[RegExp, number]> = [
  [/already[\s_-]?owned/i, 7],
  [/not[\s_-]?owned/i, 8],
  [/user[\s_-]?cancel|cancell?ed by (?:the )?user|(?:purchase|payment|flow)[\s_-]?cancell?ed/i, 1],
  [/developer[\s_-]?error/i, 5],
  [/feature[\s_-]?not[\s_-]?supported/i, -2],
  [/item[\s_-]?unavailable|product not found|not available for purchase/i, 4],
  [/billing[\s_-]?unavailable/i, 3],
  [/service[\s_-]?disconnect|not connected to the play store|client is not ready/i, -1],
  [/service[\s_-]?unavailable|service[\s_-]?timeout|timed? ?out/i, 2],
  [/network/i, 12],
];

export interface DeviceOutcome {
  code: number;
  name: string;
  // true when the number was recorded, false when it was read from wording.
  exact: boolean;
}

// The outcome of a device-side billing call, or undefined when the event
// records no failure at all.
export function outcomeOf(e: Ev): DeviceOutcome | undefined {
  if (!isApp(e)) return undefined;
  const app = e as AppEv;
  if (typeof app.responseCode === 'number') {
    return { code: app.responseCode, name: RESPONSE_CODES[app.responseCode] ?? `UNKNOWN(${app.responseCode})`, exact: true };
  }
  const text = `${app.errorCode ?? ''} ${app.errorMessage ?? ''}`.trim();
  if (!text) return undefined;
  for (const [pattern, code] of FROM_TEXT) {
    if (pattern.test(text)) return { code, name: RESPONSE_CODES[code], exact: false };
  }
  return undefined;
}

// Two wordings that arrive as DEVELOPER_ERROR and are not argument mistakes.
// The library returns code 5 while a connection attempt is already in flight,
// and it returns code 5 with a message naming stale product details.
export function saysAlreadyConnecting(e: Ev): boolean {
  const text = isApp(e) ? `${(e as AppEv).errorCode ?? ''} ${(e as AppEv).errorMessage ?? ''}` : '';
  return /already .{0,30}connect|in the process of connecting/i.test(text);
}
export function saysStaleDetails(e: Ev): boolean {
  const text = isApp(e) ? `${(e as AppEv).errorCode ?? ''} ${(e as AppEv).errorMessage ?? ''}` : '';
  return /expired product details|fetch product details again/i.test(text);
}

// Did this event fail with exactly this code?
export function failedWith(e: Ev, code: number): DeviceOutcome | undefined {
  const outcome = outcomeOf(e);
  return outcome && outcome.code === code ? outcome : undefined;
}

// A billing_connected that actually connected. Wrappers log the attempt with
// the code it came back with, and an attempt that failed opened nothing.
export function isConnected(e: Ev): e is AppEv {
  if (!isApp(e) || (e as AppEv).type !== 'billing_connected') return false;
  const outcome = outcomeOf(e);
  return !outcome || outcome.code === 0;
}

// Every device event that failed, in order.
export function failures(events: Ev[]): Array<{ event: AppEv; outcome: DeviceOutcome }> {
  const out: Array<{ event: AppEv; outcome: DeviceOutcome }> = [];
  for (const e of events) {
    const outcome = outcomeOf(e);
    if (outcome && outcome.code !== 0) out.push({ event: e as AppEv, outcome });
  }
  return out;
}

// How the tool words the evidence when it had to read the wrapper's text.
export function howKnown(outcome: DeviceOutcome): string {
  return outcome.exact ? `response code ${outcome.code}` : `no response code, read as ${outcome.name} from the error text`;
}
