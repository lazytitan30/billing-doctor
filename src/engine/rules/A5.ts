import { defineRule } from '../rule.js';

// An unauthenticated push endpoint accepts any body. Re-fetching from Google
// makes a forged body harmless, which is why this is medium, not high.
export const A5 = defineRule({
  id: 'A5',
  group: 'A',
  severity: 'medium',
  title: 'Push endpoint is unauthenticated',
  detects:
    'config.rtdn.pushEndpointAuth is none. Anyone who finds the URL can post a notification; the severity drops to low when every notification is re-fetched from Google before state changes.',
  run(tl) {
    if (tl.config.rtdn?.pushEndpointAuth !== 'none') return [];
    const refetches = tl.policy.refetchOnEveryNotification === true;
    return [
      {
        evidence: [],
        confidence: 'certain' as const,
        severity: refetches ? ('low' as const) : ('medium' as const),
        mechanism: `The push endpoint accepts any body. ${refetches ? 'Every notification is re-fetched from Google before state changes, so a forged body can at most cost an API call.' : 'The policy does not say every notification is re-fetched, so a forged body could change state.'}`,
        nextCheck: `Turn on authentication on the push subscription (a Google-signed OIDC token for your service account, verified in the handler), or at least a shared secret on the URL, set together with the subscription or delivery breaks. Keep re-fetching either way.`,
      },
    ];
  },
});
