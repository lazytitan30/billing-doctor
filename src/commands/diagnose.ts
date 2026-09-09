// `billing-doctor diagnose timeline.json`: validate, run the rules, print the
// findings grouped by severity, exit 1 when any high finding exists.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseTimeline } from '../engine/timeline.js';
import { diagnose } from '../engine/diagnose.js';
import { formatFindings } from '../engine/findings.js';
import { VERSION } from '../index.js';

export const DIAGNOSE_HELP = `Usage: billing-doctor diagnose <timeline.json> [--json] [--rules B1,C3]

Runs every rule over the timeline and prints the findings, grouped by
severity, each with its evidence, Google's rule, a confidence and the next
check. Exits 1 when any high finding exists, so it can gate CI.
  --json           machine output: { findings, summary, exitCode, warnings }
  --rules <ids>    run only these rules (comma-separated)`;

export function runDiagnose(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean', default: false },
      rules: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (values.help || !file) {
    console.log(DIAGNOSE_HELP);
    return file || values.help ? 0 : 2;
  }

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`cannot read ${file}: ${(err as Error).message}`);
    return 2;
  }
  const parsed = parseTimeline(text);
  if (!parsed.ok) {
    for (const error of parsed.errors) console.error(`error: ${error}`);
    console.error(`${file}: not a valid timeline (${parsed.errors.length} error(s)); run billing-doctor validate for details`);
    return 2;
  }

  const rules = values.rules ? values.rules.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const result = diagnose(parsed.timeline!, { rules });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          tool: `billing-doctor ${VERSION}`,
          file,
          events: parsed.timeline!.events.length,
          findings: result.findings,
          summary: result.summary,
          exitCode: result.exitCode,
          warnings: parsed.warnings,
          errors: result.errors,
        },
        null,
        2,
      ),
    );
    return result.exitCode;
  }

  console.log(`billing-doctor ${VERSION}: ${file}, ${parsed.timeline!.events.length} events, ${result.summary}`);
  console.log('');
  for (const warning of parsed.warnings) console.log(`warning: ${warning}`);
  if (parsed.warnings.length) console.log('');
  console.log(formatFindings(result.findings, result.timeline));
  for (const error of result.errors) console.error(`rule error: ${error}`);
  if (result.exitCode === 1) console.log('exit 1: a high finding is present');
  return result.exitCode;
}
