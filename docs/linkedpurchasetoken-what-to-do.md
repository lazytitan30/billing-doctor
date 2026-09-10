# What to do with linkedPurchaseToken

**The ticket.** "After the upgrade the user had both tiers." Or: "The user re-subscribed in the app and renewals stopped mapping to them."

**Google's rule.** `linkedPurchaseToken` is "The purchase token of the old subscription if this subscription is one of the following: Re-signup of a canceled but non-lapsed subscription; Upgrade/downgrade from a previous subscription." And: "Be sure to invalidate the token provided in the linkedPurchaseToken to ensure that the old token is not used to gain access to your services." (purchases.subscriptionsv2 and the subscriptions guide, read 2026-09-09.)

**How it happens.** An upgrade, downgrade or in-app re-signup creates a new token. The new resource names the old one. A backend that grants the new token and forgets the old leaves the user with both; a backend that keeps writing the old token misses the live one. Only a restore from the Play subscriptions centre keeps the same token.

**Check it.**

```bash
billing-doctor state new-subscription.json   # names the linked token and says to invalidate it
billing-doctor diagnose timeline.json
```

Rules that speak here: **F1** (linked token still granting), **F3** (re-signup bound to the wrong token), **F2** (DEFERRED replacement granted early), **F4** (expiry not re-read after proration), **E2** (a Play Store restart handled as a new token).

**Fix, in short.** On every fetch, if `linkedPurchaseToken` is present, revoke that token's row before granting the new one, and bind the user to the new token. Store `expiryTime` from the new resource. For DEFERRED, keep the old tier until the old item expires. The Incident Kit's runbook entries F1 to F4 carry the steps and a reference `apply` function that does this in one place.

Not affiliated with Google. Google Play is a trademark of Google LLC.
