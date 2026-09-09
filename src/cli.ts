#!/usr/bin/env node
// The command line. One subcommand per verb; each lives in src/commands and
// returns an exit code. Argument parsing uses node:util.parseArgs so the
// package carries no CLI dependency.

import { VERSION } from './index.js';
import { runInit } from './commands/init.js';
import { runValidate } from './commands/validate.js';

const USAGE = `billing-doctor ${VERSION}: incident diagnosis for Google Play Billing integrations.
Runs locally, calls nothing, changes nothing at Google. Not affiliated with Google.

Usage: billing-doctor <command> [options]

Commands:
  init        write an empty timeline with the policy block filled from questions
  validate    check a timeline file against the schema

Run billing-doctor <command> --help for the options of one command.`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'init':
      return runInit(rest);
    case 'validate':
      return runValidate(rest);
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
