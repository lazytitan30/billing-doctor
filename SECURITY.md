# Security

## Reporting a vulnerability

Email **hello@billingdoctor.dev**, or use GitHub's private vulnerability
reporting on this repository. Please do not open a public issue for a security
problem.

Tell us what you found, how to reproduce it, and what it lets someone do. You
will get a reply within a week. If the problem is real we will fix it, publish a
new version, and credit you unless you would rather we did not.

## What this tool touches, and why that matters

Billing Doctor reads logs from a Google Play Billing integration. Those logs can
contain things that must not leak:

- **Purchase tokens.** A purchase token is a bearer credential for the Google
  Play Developer API. Anyone holding one can query it.
- **Service-account keys.** The optional `--fetch` mode takes a key file that
  grants access to your Play Console financial data.
- **User identifiers.** Obfuscated account ids, order ids, email addresses.

So a bug that writes any of those somewhere unexpected is a security bug here,
not a cosmetic one. Report it as such.

## The promises this tool makes

These are the properties a vulnerability report would be measuring against:

1. **It makes no network calls unless you pass `--fetch`.** Without that flag it
   reads local files and writes local files. There is no telemetry, ever, and
   there is no analytics, no update check and no error reporting.
2. **With `--fetch`, it talks to Google and nowhere else**, using your own
   service-account key, and only ever reads. It never acknowledges, consumes,
   refunds, revokes, cancels or defers anything.
3. **The real purchase token never enters the output file.** `--fetch` maps
   pseudonyms to real tokens in memory, and writes only the pseudonym. This is
   verified, most recently on 2026-09-12.
4. **No part of the service-account key enters any output.** Also verified.
5. **`redact` removes** purchase tokens, emails, order ids, OAuth tokens,
   bearer tokens, UUIDs and private keys from text you paste through it.

If you find a way to break any of those five, that is the report we want most.

## Handling your own key safely

The `--fetch` key file is a password in a file. Keep it outside version control.
This repository's `.gitignore` covers the obvious names, but that only catches
the names we thought of. Prefer a path outside the repository entirely, and
delete the key when you are finished with it.

## Supported versions

The latest published version is supported. This project is young; there is no
long-term support branch yet.
