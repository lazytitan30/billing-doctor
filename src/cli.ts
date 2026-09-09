#!/usr/bin/env node
// The command line. One subcommand per verb; each lives in src/commands and
// returns an exit code. Argument parsing uses node:util.parseArgs so the
// package carries no CLI dependency.
//
// Exit codes: 0 nothing to report (or a command that succeeded), 1 a high
// finding exists (diagnose) or the input could not be decoded (rtdn), 2 a
// usage or file error.

import { VERSION } from './index.js';
import { runInit } from './commands/init.js';
import { runValidate } from './commands/validate.js';
import { runRtdn } from './commands/rtdn.js';
import { runState } from './commands/state.js';
import { runDiagnose } from './commands/diagnose.js';
import { runRedact } from './commands/redact.js';
import { runRules, runRule } from './commands/rules.js';
import { runMcp } from './commands/mcp.js';

const USAGE = `billing-doctor ${VERSION}: incident diagnosis for Google Play Billing integrations.
Runs locally, calls nothing, changes nothing at Google. Not affiliated with Google.

Usage: billing-doctor <command> [options]

Commands:
  diagnose    run every rule over a timeline and print the findings (exit 1 on a high finding)
  init        write an empty timeline with the policy block filled from questions
  validate    check a timeline file against the schema
  state       explain a purchases.subscriptionsv2 resource in plain words
  rtdn        decode a Pub/Sub push body and say what the next step must be
  redact      replace tokens, emails, order ids and secrets in a log so it can be shared
  rules       list the rule catalogue
  rule <id>   print one rule in full, with the runbook entry when the kit folder is present
  mcp         serve the six tools over stdio for a coding agent

Run billing-doctor <command> --help for the options of one command.`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'diagnose':
      return runDiagnose(rest);
    case 'init':
      return runInit(rest);
    case 'validate':
      return runValidate(rest);
    case 'state':
      return runState(rest);
    case 'rtdn':
      return runRtdn(rest);
    case 'redact':
      return runRedact(rest);
    case 'rules':
      return runRules(rest);
    case 'rule':
      return runRule(rest);
    case 'mcp':
      return runMcp(rest);
    case '--version':
    case '-v':
      console.log(VERSION);
      return 0;
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      console.log(USAGE);
      return command === undefined ? 2 : 0;
    default:
      console.error(`unknown command: ${command}\n`);
      console.error(USAGE);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  },
);
