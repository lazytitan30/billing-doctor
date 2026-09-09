# Billing Doctor

Billing Doctor reads what happened to a Google Play purchase and tells you where it broke. It runs on your machine, calls nothing, changes nothing at Google, and shows its evidence. Not affiliated with Google.

**Status:** pre-release. The package is being built commit by commit; this README grows with it.

## What it is

A free, open-source diagnostic for developers who run their own Google Play Billing backend. You give it a redacted timeline of one purchase (the notifications Google sent, the API answers, what your backend wrote, what the user reported) and it checks the timeline against Google's documented rules. Every finding carries the events it rests on, Google's rule quoted with a dated link, a confidence, and the next thing to check.

Three faces on one engine: a command line, a library, and an MCP server over stdio so a coding agent can call it while you fix the bug.

## What it is not

Not an SDK, not a hosted service, not a RevenueCat replacement, not a dashboard, and not legal or financial advice. It never acknowledges, consumes, refunds, revokes, cancels or defers anything. It reads files and prints findings. It does not diagnose Apple.

## Privacy

No network calls by default. No telemetry, ever. Your logs never leave your machine.

## Licence and trademarks

MIT. Google Play is a trademark of Google LLC. Billing Doctor is an independent project and is not affiliated with, endorsed by, or sponsored by Google.
