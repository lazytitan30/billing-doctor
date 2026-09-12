// `billing-doctor diagnose timeline.json`: validate, run the rules, print the
// findings grouped by severity, exit 1 when any high finding exists.

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseTimeline } from '../engine/timeline.js';
import { diagnose } from '../engine/diagnose.js';
import { formatFindings } from '../engine/findings.js';
import { VERSION } from '../index.js';
import { findKit, kitPathIsWrong, runbookEntry } from '../kit.js';
import { fetchForTimeline } from '../fetch.js';

export const DIAGNOSE_HELP = `Usage: billing-doctor diagnose <timeline.json> [--json] [--rules B1,C3] [--kit <path>]
       billing-doctor diagnose <timeline.json> --fetch --service-account <key.json> [--token-map <map.json>] [--package <name>] [--out <file>]

Runs every rule over the timeline and prints the findings, grouped by
severity, each with its evidence, Google's rule, a confidence and the next
check. Exits 1 when any high finding exists, so it can gate CI.
  --json           machine output: { findings, summary, exitCode, warnings }
  --rules <ids>    run only these rules (comma-separated)
  --kit <path>     the Incident Kit folder (also BILLING_DOCTOR_KIT, or ./billing-doctor-kit)

The one optional network feature, off by default:
  --fetch                     read purchases.subscriptionsv2.get for every token and append the answers as api events
  --service-account <file>    your own service-account key (needs "View financial data"); nothing goes anywhere but Google
  --token-map <file>          JSON { "tok_a1": "<real token>" }; pseudonyms without an entry are skipped
  --package <name>            the package name (default: app.packageName in the timeline)
  --out <file>                write the augmented timeline here; the real tokens never enter it
  --api-base <url>            send the API calls somewhere other than Google, for testing against a stub
  --token-url <url>           exchange the key somewhere other than Google, for testing against a stub

Both overrides, and a token_uri inside the key file, move where your credentials
go. Any of them prints a warning naming the host, every time.`;

export async function runDiagnose(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean', default: false },
      rules: { type: 'string' },
      kit: { type: 'string' },
      fetch: { type: 'boolean', default: false },
      'service-account': { type: 'string' },
      'token-map': { type: 'string' },
      package: { type: 'string' },
      out: { type: 'string' },
      // For testing against a local stub of Google's endpoints.
      'api-base': { type: 'string' },
      'token-url': { type: 'string' },
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

  let timeline = parsed.timeline!;
  let fetched: Array<{ token: string; status: number }> = [];
  let skipped: string[] = [];
  if (values.fetch) {
    if (!values['service-account']) {
      console.error('--fetch needs --service-account <key.json>: your own key, never committed');
      return 2;
    }
    try {
      const tokenMap = values['token-map'] ? (JSON.parse(readFileSync(values['token-map'], 'utf8')) as Record<string, string>) : undefined;
      const augmented = await fetchForTimeline(timeline, {
        serviceAccountPath: values['service-account'],
        tokenMap,
        packageName: values.package,
        apiBase: values['api-base'],
        warn: (m: string) => process.stderr.write(`warning: ${m}
`),
        tokenUrl: values['token-url'],
      });
      timeline = augmented.timeline;
      fetched = augmented.fetched;
      skipped = augmented.skipped;
      if (values.out) writeFileSync(values.out, `${JSON.stringify(timeline, null, 2)}\n`);
    } catch (err) {
      console.error(`--fetch failed: ${(err as Error).message}`);
      return 2;
    }
  }

  const rules = values.rules ? values.rules.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const result = diagnose(timeline, { rules });
  const kitDir = findKit(values.kit);
  if (kitPathIsWrong(values.kit)) process.stderr.write(`--kit ${values.kit} is not a kit folder; it needs a runbook/ directory inside it
`);
  const runbook = (ruleId: string) => runbookEntry(kitDir, ruleId);

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          tool: `billing-doctor ${VERSION}`,
          file,
          events: timeline.events.length,
          fetched,
          skipped,
          findings: result.findings.map((f) => ({ ...f, runbook: runbook(f.ruleId) ?? null })),
          kit: kitDir ?? null,
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

  console.log(`billing-doctor ${VERSION}: ${file}, ${timeline.events.length} events, ${result.summary}`);
  if (values.fetch) {
    // Report the answer, not the attempt. Saying "fetched 50 tokens" when all
    // fifty came back 401 is how somebody spends an afternoon looking in the
    // wrong place, and it is the same fault B12 exists to catch in other
    // people's code.
    const ok = fetched.filter((f) => f.status >= 200 && f.status < 300);
    const bad = fetched.filter((f) => f.status < 200 || f.status >= 300);
    const byStatus = [...new Set(bad.map((f) => f.status))].sort((a, b) => a - b);
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const parts = [`read ${plural(ok.length, 'token')} from Google`];
    if (bad.length) parts.push(`${plural(bad.length, 'token')} answered ${byStatus.join(', ')}`);
    if (skipped.length) parts.push(`skipped ${plural(skipped.length, 'pseudonym')} with no map entry (${skipped.join(', ')})`);
    if (values.out) parts.push(`wrote ${values.out}`);
    console.log(parts.join('; '));
    // One status across the board is a credential or a permission problem, not
    // fifty separate purchase problems.
    if (bad.length && ok.length === 0 && byStatus.length === 1) {
      const [only] = byStatus;
      const why =
        only === 401
          ? 'the service-account key was not accepted at all'
          : only === 403
            ? 'the key is valid but lacks the Play Console permission, and a fresh grant can take hours to propagate'
            : only === 404 || only === 410
              ? 'no token in the map resolved; check the map holds real tokens for this package, and that none is more than sixty days past expiry'
              : 'every call failed the same way, so look at the credential and the package name before the purchases';
      console.log(`  every call answered ${only}: ${why}.`);
    }
  }
  console.log('');
  for (const warning of parsed.warnings) console.log(`warning: ${warning}`);
  if (parsed.warnings.length) console.log('');
  console.log(formatFindings(result.findings, result.timeline, runbook));
  for (const error of result.errors) console.error(`rule error: ${error}`);
  if (result.exitCode === 1) console.log('exit 1: a high finding is present');
  return result.exitCode;
}
