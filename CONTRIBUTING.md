# Contributing

The most useful thing you can send is an incident the tool got wrong.

## The incident that found nothing

If you ran it on a real problem and it said nothing useful, open an issue with
the label **`silent`** and paste the redacted timeline. Run it through `redact`
first; that is what the command is for.

A `silent` issue is worth more than a pull request. Every rule in this catalogue
exists because something broke for somebody, and the gaps we know about all came
from someone reporting one.

## Adding a rule

A rule needs four things, and it does not ship without all four:

1. Its file in `src/engine/rules/`, doing one thing that can be said in two
   sentences.
2. Its Google fact in `src/google/docs.ts`: a verbatim quote, an https link, and
   the date you read the page. **A rule without a documentation quote does not
   ship.** No exceptions, including for things that are obviously true.
3. A fixture in `fixtures/rules/` with an `expected.json`, triggering exactly
   that rule and nothing else.
4. One line in `src/engine/catalogue.ts`.

The five fixtures in `fixtures/clean/` are correct lifecycles. They must keep
producing zero findings forever. A false positive there is a release blocker,
because a tool that cries wolf about working code is worse than no tool.

## Running things

```bash
npm test                        # the whole suite
node --test tests/rules-B.test.js   # one group
node scripts/preflight.mjs      # what must be true before a release
node scripts/acceptance.mjs     # the packed tarball, used as a stranger uses it
node scripts/ci-local.mjs       # everything CI runs, on a clean checkout
```

## What does not belong here

This tool is local and read-only. It will never acknowledge, consume, refund,
revoke, cancel or defer anything, it will never phone home, and it will never
grow a hosted component. A change in any of those directions will be declined
however well it is written.
