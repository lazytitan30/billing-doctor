## What this changes, and why

<!-- Two sentences. If it takes more, it is probably two pull requests. -->

## If this adds or changes a rule

A rule does not ship without all four:

- [ ] Its file in `src/engine/rules/`, doing one thing
- [ ] Its Google fact in `src/google/docs.ts`: verbatim quote, https link, the date you read it
- [ ] A fixture in `fixtures/rules/` with an `expected.json`, triggering exactly that rule
- [ ] One line in `src/engine/catalogue.ts`

## Before this is merged

- [ ] `npm test` passes
- [ ] `node scripts/preflight.mjs` passes
- [ ] `node scripts/acceptance.mjs` passes
- [ ] The five fixtures in `fixtures/clean/` still produce zero findings

That last one is not a formality. A tool that cries wolf about working code is
worse than no tool, so a false positive there is a release blocker.
