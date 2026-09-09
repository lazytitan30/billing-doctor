// `billing-doctor redact < logs.txt`: read text from stdin or a file, print
// the redacted text, and say on stderr what was replaced. The mapping from
// real values to pseudonyms is never printed.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { redact, describeCounts } from '../redact.js';

export const REDACT_HELP = `Usage: billing-doctor redact [file] [--salt <text>] [--quiet]

Reads stdin (or the file), writes the redacted text to stdout.
Purchase tokens become stable tok_ pseudonyms, emails are removed, order ids
keep their last four characters, UUIDs become u_ pseudonyms, private keys and
bearer tokens are cut out. Counts go to stderr.
  --salt <text>  mix a salt into the pseudonyms
  --quiet        no counts on stderr`;

export function runRedact(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      salt: { type: 'string' },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(REDACT_HELP);
    return 0;
  }
  let text: string;
  try {
    text = positionals[0] ? readFileSync(positionals[0], 'utf8') : readFileSync(0, 'utf8');
  } catch (err) {
    console.error(`cannot read ${positionals[0] ?? 'stdin'}: ${(err as Error).message}`);
    return 2;
  }
  const result = redact(text, { salt: values.salt });
  process.stdout.write(result.text);
  if (!values.quiet) console.error(describeCounts(result.counts));
  return 0;
}
