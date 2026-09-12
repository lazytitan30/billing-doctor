// The one optional network feature: `diagnose --fetch`.
//
// With the developer's own service-account key, read purchases.subscriptionsv2
// for every token in a timeline and append Google's answers as `api` events.
// Nothing goes anywhere but Google. The timeline keeps its pseudonyms: a real
// token comes from a separate map file the developer keeps locally (or from a
// timeline that still carries real tokens, which the validator warns about),
// and the appended events carry the pseudonym, never the token.
//
// No dependency: the JWT is signed with node:crypto, the exchange and the API
// call use the built-in fetch. The service account needs the "View financial
// data" permission in the Play Console and the androidpublisher scope.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Timeline } from './engine/timeline.js';
import { looksLikePseudonym } from './engine/timeline.js';
import { pseudonymForToken, findTokens } from './redact.js';

export const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
export const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const DEFAULT_API_BASE = 'https://androidpublisher.googleapis.com';

// Where a Google credential is allowed to go without comment. Anything else is
// still permitted, because testing against a local stub is legitimate and this
// tool does not get to decide who you talk to, but it is never silent.
const GOOGLE_HOSTS = /(^|\.)(googleapis\.com|google\.com)$/;
export function isGoogleEndpoint(url: string): boolean {
  try {
    return GOOGLE_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function loadServiceAccount(path: string): ServiceAccount {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ServiceAccount>;
  if (typeof value.client_email !== 'string' || typeof value.private_key !== 'string') {
    throw new Error(`${path} is not a service-account key file (client_email and private_key are required)`);
  }
  return { client_email: value.client_email, private_key: value.private_key, token_uri: value.token_uri };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A signed JWT for the OAuth 2.0 JWT bearer grant, valid for one hour.
export function signJwt(account: ServiceAccount, options: { tokenUrl: string; nowMs: number }): string {
  const iat = Math.floor(options.nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: options.tokenUrl, iat, exp: iat + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(account.private_key));
  return `${header}.${claims}.${signature}`;
}

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export async function getAccessToken(
  account: ServiceAccount,
  options: { fetch: FetchLike; tokenUrl: string; nowMs: number },
): Promise<string> {
  const assertion = signJwt(account, { tokenUrl: options.tokenUrl, nowMs: options.nowMs });
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString();
  const response = await options.fetch(options.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (response.status !== 200) throw new Error(`token exchange failed: ${response.status} ${await response.text()}`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('token exchange answered without an access_token');
  return json.access_token;
}

export interface FetchedSubscription {
  status: number;
  resource?: Record<string, unknown>;
}

export async function fetchSubscription(
  accessToken: string,
  packageName: string,
  purchaseToken: string,
  options: { fetch: FetchLike; apiBase: string },
): Promise<FetchedSubscription> {
  // Validate the base on its own, so a malformed one fails without the real
  // purchase token in the message. It used to appear in full in the thrown
  // "Failed to parse URL from ..." and go straight to stderr.
  try {
    void new URL(options.apiBase);
  } catch {
    throw new Error(`the API base is not a URL: ${options.apiBase}`);
  }
  const url = `${options.apiBase}/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await options.fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (response.status !== 200) return { status: response.status };
  return { status: 200, resource: (await response.json()) as Record<string, unknown> };
}

// Turn a resource into a timeline `api` event under the pseudonym. Field
// values that could identify anyone (a linked real token) are pseudonymised.
export function eventFromResource(
  pseudonym: string,
  status: number,
  resource: Record<string, unknown> | undefined,
  nowIso: string,
  pseudonymFor: (real: string) => string,
): Record<string, unknown> {
  const event: Record<string, unknown> = { t: nowIso, kind: 'api', call: 'subscriptionsv2.get', token: pseudonym, status, note: 'fetched by --fetch' };
  if (!resource) return event;
  const items = Array.isArray(resource.lineItems) ? (resource.lineItems as Array<Record<string, unknown>>) : [];
  event.subscriptionState = resource.subscriptionState;
  event.acknowledgementState = resource.acknowledgementState;
  event.lineItems = items.map((item) => ({
    productId: item.productId,
    expiryTime: item.expiryTime,
    ...(item.autoRenewingPlan ? { autoRenewingPlan: true } : {}),
    ...(item.prepaidPlan ? { prepaidPlan: true } : {}),
    ...(item.deferredItemReplacement ? { deferredItemReplacement: item.deferredItemReplacement } : {}),
  }));
  event.linkedPurchaseToken = typeof resource.linkedPurchaseToken === 'string' ? pseudonymFor(resource.linkedPurchaseToken) : null;
  event.testPurchase = resource.testPurchase !== undefined && resource.testPurchase !== null;
  const ids = resource.externalAccountIdentifiers as { obfuscatedExternalAccountId?: string } | undefined;
  event.externalAccountIdentifiers = ids ? { obfuscatedExternalAccountId: ids.obfuscatedExternalAccountId } : null;
  if (resource.pausedStateContext) event.pausedStateContext = resource.pausedStateContext;
  if (resource.canceledStateContext && typeof resource.canceledStateContext === 'object') {
    event.canceledStateContext = Object.keys(resource.canceledStateContext as object)[0];
  }
  return event;
}

export interface FetchOptions {
  serviceAccountPath: string;
  tokenMap?: Record<string, string>; // pseudonym -> real token
  packageName?: string; // defaults to timeline.app.packageName
  now?: Date;
  fetch?: FetchLike;
  apiBase?: string;
  tokenUrl?: string;
  // Where to say something the reader must see. The command passes stderr.
  warn?: (message: string) => void;
}

export interface FetchResult {
  timeline: Timeline;
  fetched: Array<{ token: string; status: number }>;
  skipped: string[]; // pseudonyms with no real token to fetch
}

export async function fetchForTimeline(timeline: Timeline, options: FetchOptions): Promise<FetchResult> {
  const account = loadServiceAccount(options.serviceAccountPath);
  const fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const tokenUrl = options.tokenUrl ?? account.token_uri ?? DEFAULT_TOKEN_URL;
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  // Say where the credential is going whenever that is not Google. A signed
  // assertion carries the service-account identity, and the access token it
  // buys can read financial data, so a redirect the reader did not intend is
  // worth a line on stderr every single time.
  const offGoogle = [
    ...(isGoogleEndpoint(tokenUrl) ? [] : [`token exchange -> ${tokenUrl}`]),
    ...(isGoogleEndpoint(apiBase) ? [] : [`API calls -> ${apiBase}`]),
  ];
  if (offGoogle.length) {
    options.warn?.(`sending credentials to a host that is not Google: ${offGoogle.join('; ')}`);
  }
  const packageName = options.packageName ?? timeline.app?.packageName;
  if (!packageName) throw new Error('no package name: set app.packageName in the timeline or pass --package');
  const now = options.now ?? new Date();
  const nowIso = now.toISOString().replace('.000Z', 'Z');
  const map = options.tokenMap ?? {};
  const realToPseudonym = new Map<string, string>(Object.entries(map).map(([p, r]) => [r, p]));
  const pseudonymFor = (real: string) => realToPseudonym.get(real) ?? pseudonymForToken(real);

  const tokens = [...new Set(timeline.events.map((e) => e.token).filter((t): t is string => typeof t === 'string'))];
  const fetched: FetchResult['fetched'] = [];
  const skipped: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  let accessToken: string | undefined;

  for (const token of tokens) {
    const real = (Object.hasOwn(map, token) ? map[token] : undefined) ?? (looksLikePseudonym(token) ? undefined : token);
    if (!real) {
      skipped.push(token);
      continue;
    }
    const pseudonym = looksLikePseudonym(token) ? token : pseudonymFor(token);
    accessToken ??= await getAccessToken(account, { fetch: fetchImpl, tokenUrl, nowMs: now.getTime() });
    const answer = await fetchSubscription(accessToken, packageName, real, { fetch: fetchImpl, apiBase });
    fetched.push({ token: pseudonym, status: answer.status });
    events.push(eventFromResource(pseudonym, answer.status, answer.resource, nowIso, pseudonymFor));
  }

  // Tokens that were real in the input are pseudonymised in the output too.
  //
  // By scanning the serialised event rather than by naming fields. The schema
  // is a looseObject, so an event can carry anything, and naming fields missed
  // oldToken, linkedPurchaseToken, expiredPurchaseToken and every free-text
  // field: an idempotencyKey built from a token, a note quoting one. The help
  // text promises the real tokens never enter this file, so the only safe rule
  // is to replace every real token everywhere it appears.
  const serialised = JSON.stringify(timeline.events);
  const realTokens = [...new Set([
    ...Object.values(map).filter((t): t is string => typeof t === 'string' && t.length > 0),
    ...timeline.events.map((e) => e.token).filter((t): t is string => typeof t === 'string' && !looksLikePseudonym(t)),
    // And anything token-shaped anywhere in any event, wherever it sits:
    // oldToken, linkedPurchaseToken, an expired token nested in the
    // out-of-app context, or one quoted inside a note.
    ...findTokens(serialised).filter((t) => !looksLikePseudonym(t)),
  ])].sort((a, b) => b.length - a.length); // longest first, so a token that contains another is replaced whole

  const scrub = (event: unknown): unknown => {
    let text = JSON.stringify(event);
    for (const real of realTokens) text = text.split(real).join(pseudonymFor(real));
    return JSON.parse(text) as unknown;
  };
  const rewritten = realTokens.length ? (timeline.events.map(scrub) as typeof timeline.events) : timeline.events;
  const augmented = { ...timeline, events: [...rewritten, ...events] } as Timeline;
  return { timeline: augmented, fetched, skipped };
}
