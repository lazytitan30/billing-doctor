// purchases.subscriptionsv2 states, in plain words, and an explainer for a
// SubscriptionPurchaseV2 resource. The state names and field meanings are
// Google's, read on 2026-09-09 (src/google/docs.ts has the URLs). The access
// column is Google's rule; the developer's own policy is applied beside it,
// never instead of it.

import { own } from '../engine/helpers.js';

export type Access = 'yes' | 'no' | 'until-expiry' | 'not-yet';

export interface StateInfo {
  name: string;
  access: Access;
  words: string;
}

export const SUBSCRIPTION_STATE_INFO: Record<string, StateInfo> = {
  SUBSCRIPTION_STATE_UNSPECIFIED: {
    name: 'SUBSCRIPTION_STATE_UNSPECIFIED',
    access: 'no',
    words: 'unspecified; treat as no access and fetch again',
  },
  SUBSCRIPTION_STATE_PENDING: {
    name: 'SUBSCRIPTION_STATE_PENDING',
    access: 'not-yet',
    words: 'created but awaiting payment during signup; grant nothing and acknowledge nothing yet',
  },
  SUBSCRIPTION_STATE_ACTIVE: {
    name: 'SUBSCRIPTION_STATE_ACTIVE',
    access: 'yes',
    words: 'active; the user has access',
  },
  SUBSCRIPTION_STATE_PAUSED: {
    name: 'SUBSCRIPTION_STATE_PAUSED',
    access: 'no',
    words: 'paused by the user; no access until it resumes',
  },
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: {
    name: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    access: 'yes',
    words: 'a renewal payment failed and Google is retrying; the user keeps access',
  },
  SUBSCRIPTION_STATE_ON_HOLD: {
    name: 'SUBSCRIPTION_STATE_ON_HOLD',
    access: 'no',
    words: 'the grace period ended without payment; the user loses access until the payment method is fixed',
  },
  SUBSCRIPTION_STATE_CANCELED: {
    name: 'SUBSCRIPTION_STATE_CANCELED',
    access: 'until-expiry',
    words: 'auto-renew is off; the user keeps access until expiryTime',
  },
  SUBSCRIPTION_STATE_EXPIRED: {
    name: 'SUBSCRIPTION_STATE_EXPIRED',
    access: 'no',
    words: 'every item is past its expiry; no access',
  },
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: {
    name: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
    access: 'no',
    words: 'the pending purchase was cancelled before payment; nothing to grant',
  },
};

export const ACKNOWLEDGEMENT_STATE_WORDS: Record<string, string> = {
  ACKNOWLEDGEMENT_STATE_UNSPECIFIED: 'unspecified',
  ACKNOWLEDGEMENT_STATE_PENDING: 'not acknowledged yet',
  ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED: 'acknowledged',
};

export const CANCELLATION_WORDS: Record<string, string> = {
  userInitiatedCancellation: 'the user cancelled',
  systemInitiatedCancellation: 'Google cancelled it (a payment problem ran its course)',
  developerInitiatedCancellation: 'the developer cancelled it through the API',
  replacementCancellation: 'it was replaced by another purchase (upgrade, downgrade or re-signup)',
};

// The shape of a SubscriptionPurchaseV2 as Google returns it. Only the fields
// the explainer reads are typed; everything else passes through.
export interface SubscriptionResource {
  kind?: string;
  regionCode?: string;
  subscriptionState?: string;
  startTime?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: unknown;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean } & Record<string, unknown>;
    prepaidPlan?: { allowExtendAfterTime?: string } & Record<string, unknown>;
    offerDetails?: { basePlanId?: string; offerId?: string } & Record<string, unknown>;
    deferredItemReplacement?: { productId?: string } & Record<string, unknown>;
    latestSuccessfulOrderId?: string;
  }>;
  pausedStateContext?: { autoResumeTime?: string };
  canceledStateContext?: Record<string, unknown>;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
    externalAccountId?: string;
  };
  [extra: string]: unknown;
}

export interface ExplainOptions {
  // The developer's policy: which states grant and which revoke.
  grantOn?: string[];
  revokeOn?: string[];
  // "Now" for the deadline arithmetic; defaults to the wall clock.
  now?: Date;
}

export interface Explanation {
  state: string;
  access: Access;
  accessNow: boolean; // Google's rule, evaluated at `now`
  policyAccess?: boolean; // the developer's policy, when given
  policyDisagrees?: boolean;
  expiryTime?: string;
  lines: string[];
  nextStep: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(ms: number, now: number): string {
  const diff = ms - now;
  const days = Math.abs(diff) / DAY_MS;
  const when = days >= 1 ? `${days.toFixed(1)} days` : `${(Math.abs(diff) / 3_600_000).toFixed(1)} hours`;
  return diff >= 0 ? `in ${when}` : `${when} ago`;
}

// Explain a resource in plain words: the state, what access it implies, the
// expiry of each item, the acknowledgement state and deadline, the linked
// token, the test marker, the plan type and the cancellation context.
// A token that came from Google is real. Show enough to tell two of them
// apart and never enough to call the API with, because `state` and the MCP
// tool both print this and an assistant transcript is not a safe place for a
// bearer credential.
function maskToken(token: string): string {
  return token.length <= 10 ? '[token]' : `${token.slice(0, 4)}...${token.slice(-4)} (masked)`;
}

export function explainSubscription(resource: SubscriptionResource, options: ExplainOptions = {}): Explanation {
  const now = (options.now ?? new Date()).getTime();
  const lines: string[] = [];
  const stateName = resource.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED';
  const info = own(SUBSCRIPTION_STATE_INFO, stateName) ?? {
    name: stateName,
    access: 'no' as Access,
    words: 'not a state in the reference read on 2026-09-09; treat as no access and fetch again',
  };

  const items = resource.lineItems ?? [];
  const expiries = items.map((item) => (item.expiryTime ? Date.parse(item.expiryTime) : NaN)).filter((n) => Number.isFinite(n));
  const latestExpiry = expiries.length ? Math.max(...expiries) : undefined;
  const expiryTime = latestExpiry === undefined ? undefined : new Date(latestExpiry).toISOString();

  let accessNow: boolean;
  switch (info.access) {
    case 'yes':
      accessNow = true;
      break;
    case 'until-expiry':
      accessNow = latestExpiry === undefined ? true : latestExpiry > now;
      break;
    default:
      accessNow = false;
  }

  lines.push(`State: ${info.name}: ${info.words}.`);
  const accessWords =
    info.access === 'until-expiry'
      ? `yes until ${expiryTime ?? 'expiryTime'}${latestExpiry !== undefined ? ` (${fmt(latestExpiry, now)})` : ''}`
      : info.access === 'yes'
        ? 'yes'
        : info.access === 'not-yet'
          ? 'not yet'
          : 'no';
  lines.push(`Access under Google's rule: ${accessWords}.`);

  let policyAccess: boolean | undefined;
  let policyDisagrees: boolean | undefined;
  if (options.grantOn || options.revokeOn) {
    const grants = (options.grantOn ?? []).includes(stateName);
    const revokes = (options.revokeOn ?? []).includes(stateName);
    policyAccess = grants && !revokes;
    const googleSays = info.access === 'yes' || (info.access === 'until-expiry' && accessNow);
    policyDisagrees = policyAccess !== googleSays;
    lines.push(
      `Under your policy: ${policyAccess ? 'grant' : 'no access'}${
        policyDisagrees ? ' — this disagrees with Google\'s rule; see the D group of rules' : ''
      }.`,
    );
  }

  if (items.length === 0) {
    lines.push('Line items: none in the resource.');
  } else {
    if (items.length > 1) lines.push(`Line items: ${items.length}; each has its own expiry, read all of them.`);
    for (const item of items) {
      const plan = item.prepaidPlan
        ? 'prepaid; does not renew, a top-up extends it'
        : item.autoRenewingPlan
          ? item.autoRenewingPlan.autoRenewEnabled === false
            ? 'auto-renewing plan with auto-renew off'
            : 'auto-renewing'
          : 'plan type not stated';
      const exp = item.expiryTime ? `${item.expiryTime} (${fmt(Date.parse(item.expiryTime), now)})` : 'no expiryTime';
      const offer = item.offerDetails?.basePlanId
        ? ` base plan ${item.offerDetails.basePlanId}${item.offerDetails.offerId ? `, offer ${item.offerDetails.offerId}` : ''}`
        : '';
      lines.push(`Item ${item.productId ?? '(no productId)'}: expires ${exp}; ${plan}.${offer}`);
      if (item.deferredItemReplacement?.productId) {
        lines.push(`  Deferred replacement: becomes ${item.deferredItemReplacement.productId} at the next renewal; do not grant it before then.`);
      }
    }
  }

  const ack = resource.acknowledgementState ?? 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED';
  const ackWords = own(ACKNOWLEDGEMENT_STATE_WORDS, ack) ?? ack;
  if (ack === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    const prepaid = items.some((item) => item.prepaidPlan);
    const start = resource.startTime ? Date.parse(resource.startTime) : NaN;
    let windowText = 'within three days of the purchase';
    let deadline: number | undefined;
    if (prepaid && Number.isFinite(start) && latestExpiry !== undefined) {
      const planDays = (latestExpiry - start) / DAY_MS;
      const windowMs = planDays >= 7 ? 3 * DAY_MS : ((latestExpiry - start) / 2);
      windowText = planDays >= 7 ? 'within three days (prepaid plan of a week or longer)' : 'within half the plan length (prepaid plan under a week)';
      deadline = start + windowMs;
    } else if (Number.isFinite(start)) {
      deadline = start + 3 * DAY_MS;
    }
    const deadlineText = deadline !== undefined ? `, by ${new Date(deadline).toISOString()} (${fmt(deadline, now)})` : '';
    lines.push(
      `Acknowledgement: ${ackWords}. Acknowledge ${windowText}${deadlineText}, or Google refunds it and revokes the entitlement.`,
    );
  } else {
    lines.push(`Acknowledgement: ${ackWords}.`);
  }

  if (resource.linkedPurchaseToken) {
    lines.push(
      `Linked purchase token: ${maskToken(resource.linkedPurchaseToken)}. This purchase replaced it (upgrade, downgrade or re-signup before expiry). Invalidate the old token's access so it cannot be used twice.`,
    );
  }

  if (resource.testPurchase !== undefined && resource.testPurchase !== null) {
    lines.push('Test purchase: yes. A license tester bought it: free, renews on an accelerated clock, at most six renewals. Exclude it from revenue and from production entitlement counts.');
  }

  if (resource.canceledStateContext) {
    const keys = Object.keys(resource.canceledStateContext);
    const words = keys.map((k) => own(CANCELLATION_WORDS, k) ?? k).join('; ');
    lines.push(`Cancellation: ${words || 'context present without a known reason'}.`);
  }

  if (stateName === 'SUBSCRIPTION_STATE_PAUSED') {
    const resume = resource.pausedStateContext?.autoResumeTime;
    lines.push(`Paused: resumes ${resume ? `automatically at ${resume} (${fmt(Date.parse(resume), now)})` : 'when the user resumes it; no autoResumeTime given'}.`);
  }

  const ids = resource.externalAccountIdentifiers;
  if (ids?.obfuscatedExternalAccountId) {
    lines.push(`Obfuscated account id: ${ids.obfuscatedExternalAccountId}. Use it to find the user when the token is not bound yet.`);
  } else {
    lines.push('Obfuscated account id: none on the resource. The purchase can only be matched by its token.');
  }

  if (resource.regionCode) lines.push(`Billing region: ${resource.regionCode}.`);
  if (resource.latestOrderId) lines.push(`Latest order id: ${resource.latestOrderId}.`);

  let nextStep: string;
  switch (stateName) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      nextStep = 'keep or grant access; store expiryTime from the line items, not the clock.';
      break;
    case 'SUBSCRIPTION_STATE_CANCELED':
      nextStep = accessNow
        ? 'keep access until expiryTime; the user may restore before then and the token stays the same.'
        : 'expiryTime has passed; expect EXPIRED on the next fetch and revoke.';
      break;
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
      nextStep = 'remove access; re-grant on SUBSCRIPTION_RECOVERED after a fresh fetch.';
      break;
    case 'SUBSCRIPTION_STATE_EXPIRED':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      nextStep = 'revoke if anything is still granted.';
      break;
    case 'SUBSCRIPTION_STATE_PENDING':
      nextStep = 'wait for PURCHASED; grant nothing and acknowledge nothing until then.';
      break;
    default:
      nextStep = 'fetch the resource again; do not change state on this answer.';
  }
  lines.push(`Next step: ${nextStep}`);

  return { state: stateName, access: info.access, accessNow, policyAccess, policyDisagrees, expiryTime, lines, nextStep };
}
