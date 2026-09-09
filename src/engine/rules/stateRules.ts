// Shared shape of the D2 to D6 rules: a subscription state read from Google,
// and what the ledger or the policy did with it. Each rule is one line of
// configuration here plus its own file, so the mechanism stays in one place.

import type { RuleHit } from '../rule.js';
import type { NormalizedTimeline } from '../timeline.js';
import { expiryOf, isGrant, isOkGet, isRevoke, isRtdn, iso, precedes, grantedBefore, type Ev } from '../helpers.js';

export interface StateRuleSpec {
  state: string;
  // 'keep' means Google says the user keeps access; 'remove' means access ends.
  access: 'keep' | 'remove';
  // For 'keep' states: the ledger op that contradicts Google is a revoke.
  // For 'remove' states: a grant, or the absence of a revoke.
  short: string;
  nextCheck: string;
}

// Is there another state read, or a state-changing notification, between a and b?
function stateChangeBetween(events: Ev[], a: Ev, b: Ev): boolean {
  return events.some(
    (e) =>
      precedes(a, e) &&
      precedes(e, b) &&
      ((isOkGet(e) && e.subscriptionState !== undefined) || (isRtdn(e) && e.notification !== 'test')),
  );
}

export function runStateRule(tl: NormalizedTimeline, spec: StateRuleSpec): RuleHit[] {
  const hits: RuleHit[] = [];
  const stateName = spec.state.replace('SUBSCRIPTION_STATE_', '');

  for (const [token, events] of tl.byToken) {
    for (const read of events) {
      if (!isOkGet(read) || read.subscriptionState !== spec.state) continue;
      const expiry = expiryOf(read);

      if (spec.access === 'keep') {
        // Canceled keeps access only until expiry; a revoke after that is right.
        if (spec.state === 'SUBSCRIPTION_STATE_CANCELED' && expiry !== undefined && expiry <= read.tMs) continue;
        const revoke = events.find(
          (e) => isRevoke(e) && precedes(read, e) && (expiry === undefined || e.tMs < expiry) && !stateChangeBetween(events, read, e),
        );
        if (!revoke) continue;
        hits.push({
          evidence: [read.i, revoke.i],
          confidence: 'certain',
          mechanism: `Google answered ${stateName} for ${token} at #${read.i}${expiry !== undefined ? ` with expiryTime ${iso(expiry)}` : ''}; the ledger revoked access at #${revoke.i} with no other state read in between. ${spec.short}`,
          nextCheck: spec.nextCheck,
        });
      } else {
        const grant = events.find((e) => isGrant(e) && precedes(read, e) && !stateChangeBetween(events, read, e));
        if (grant) {
          hits.push({
            evidence: [read.i, grant.i],
            confidence: 'certain',
            mechanism: `Google answered ${stateName} for ${token} at #${read.i}; the ledger granted access at #${grant.i} with no other state read in between. ${spec.short}`,
            nextCheck: spec.nextCheck,
          });
          continue;
        }
        if (!grantedBefore(events, read)) continue;
        const later = events.find((e) => precedes(read, e) && (isRevoke(e) || (isOkGet(e) && e.subscriptionState !== spec.state)));
        if (later && isRevoke(later)) continue;
        const standingGrant = [...events].reverse().find((e) => isGrant(e) && precedes(e, read));
        hits.push({
          evidence: standingGrant ? [standingGrant.i, read.i] : [read.i],
          confidence: 'likely',
          mechanism: `Google answered ${stateName} for ${token} at #${read.i} while the ledger still granted access (from #${standingGrant?.i ?? '?'}), and no revoke followed. ${spec.short}`,
          nextCheck: spec.nextCheck,
        });
      }
    }
  }

  // The policy block can contradict Google on its own.
  const policy = tl.policy;
  const explicitGrant = tl.raw.policy?.grantOn !== undefined;
  const contradicts =
    spec.access === 'keep'
      ? policy.revokeOn.includes(spec.state) || (explicitGrant && !policy.grantOn.includes(spec.state))
      : policy.grantOn.includes(spec.state);
  if (contradicts) {
    hits.push({
      evidence: [],
      confidence: 'possible',
      mechanism: `policy.${spec.access === 'keep' ? (policy.revokeOn.includes(spec.state) ? 'revokeOn lists' : 'grantOn omits') : 'grantOn lists'} ${spec.state}. ${spec.short}`,
      nextCheck: `Check the backend's state switch against the policy block; ${spec.nextCheck}`,
    });
  }
  return hits;
}
