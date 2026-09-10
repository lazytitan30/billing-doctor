# Notifications are not arriving: the Pub/Sub permission

**The ticket.** "Renewals stopped showing up. Purchases still go through in the app, but our backend never hears about them."

**Google's rule.** "Add the service account google-play-developer-notifications@system.gserviceaccount.com, and grant it the role of Pub/Sub Publisher." (Getting ready, read 2026-09-09, https://developer.android.com/google/play/billing/getting-ready). Also: "you can choose to use the same GCP project as the one used to access the Play Developer API, or you can create a new GCP project for each app."

**How it happens.** Someone recreated the topic, tightened IAM, or moved projects, and the grant went with it. Nothing errors on your side: the endpoint is simply quiet. The second way: the topic lives in a Cloud project nobody expects, and an engineer concludes it is missing. The third way: the endpoint answers a status Pub/Sub does not treat as acknowledged, and the same message comes back for days.

**Check it.**

```bash
billing-doctor diagnose timeline.json
```

Rules that speak here: **A1** (purchases with no notification within fifteen minutes), **A3** (the topic in another project), **A4** (a negative acknowledgement redelivered; only 102, 200, 201, 202 and 204 count), **A5** (an unauthenticated endpoint).

**Fix, in short.** In the Cloud Console, confirm the publisher grant on the topic; in the Play Console, Monetization setup, confirm the full topic name and send a test message; write down which project holds what. Then reconcile every token that renewed, cancelled or was refunded in the silent period with `purchases.voidedpurchases.list` (30 days back at most) and `subscriptionsv2.get`. The Incident Kit's checklist covers the setup end to end.

Not affiliated with Google. Google Play is a trademark of Google LLC.
