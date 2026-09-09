# Changelog

## 0.1.0 (unreleased)

First release.

- The `billing-doctor-timeline/1` format: six event kinds, a policy block, validation with warnings for real-looking tokens, user ids and emails.
- 63 rules in ten groups, each with Google's rule quoted verbatim and dated (read 2026-09-09) in `src/google/docs.ts`.
- One minimal fixture per rule, three composite weeks, five clean lifecycles that must produce nothing.
- Commands: `diagnose`, `init`, `validate`, `state`, `rtdn`, `redact`, `rules`, `rule`, `mcp`.
- MCP server over stdio with six tools; Claude Code plugin and skill; Gemini CLI extension; MCP registry manifest.
- Kit detection: a `billing-doctor-kit` folder unlocks runbook text. No licence server, no network.
