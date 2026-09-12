// `billing-doctor rules` lists the catalogue; `billing-doctor rule B1` prints
// one rule in full, with the runbook entry when the kit folder is present.

import { parseArgs } from 'node:util';
import { RULES, GROUPS, ruleById } from '../engine/catalogue.js';
import { googleRule } from '../google/docs.js';
import { findKit, kitPathIsWrong, runbookEntry, KIT_LINE, KIT_POINTER } from '../kit.js';
import type { Rule } from '../engine/rule.js';

export const RULES_HELP = `Usage: billing-doctor rules [--json]

Lists every rule: id, severity, title, grouped.`;

export const RULE_HELP = `Usage: billing-doctor rule <id> [--kit <path>] [--json]

Prints one rule: what it detects, Google's rule with the link and the date it
was read, and the runbook entry when the Incident Kit folder is present.`;

export function formatRuleList(rules: Rule[], kitDir?: string): string {
  const lines: string[] = [];
  for (const [group, name] of Object.entries(GROUPS)) {
    const inGroup = rules.filter((r) => r.group === group);
    if (inGroup.length === 0) continue;
    lines.push(`${group}. ${name}`);
    for (const r of inGroup) lines.push(`  ${r.id.padEnd(4)}${r.severity.padEnd(7)}${r.title}`);
    lines.push('');
  }
  lines.push(`${rules.length} rules. billing-doctor rule <id> prints one in full.`);
  // Only when they do not already have it.
  if (!kitDir) lines.push(KIT_LINE);
  return lines.join('\n');
}

export function formatRule(rule: Rule, kitDir: string | undefined): string {
  const fact = googleRule(rule.id);
  const lines = [
    `${rule.id}  ${rule.title}`,
    `Group: ${rule.group}. ${GROUPS[rule.group]}`,
    `Severity: ${rule.severity}`,
    '',
    'Detects:',
    `  ${rule.detects}`,
    '',
    "Google's rule:",
    `  "${fact.quote}"`,
    `  ${fact.title}, read ${fact.readOn}`,
    `  ${fact.url}`,
  ];
  if (fact.context) lines.push('', 'Context:', `  ${fact.context}`);
  if (fact.observed) lines.push('', 'Observed in a live app:', `  ${fact.observed}`);
  const entry = runbookEntry(kitDir, rule.id);
  lines.push('', entry ? `Runbook (${kitDir}):` : 'Runbook:');
  lines.push(entry ? entry.trimEnd() : `  ${KIT_POINTER}`);
  return lines.join('\n');
}

export function runRules(argv: string[]): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(RULES_HELP);
    return 0;
  }
  if (argv.includes('--json')) {
    console.log(
      JSON.stringify(
        RULES.map((r) => ({ id: r.id, group: r.group, groupName: GROUPS[r.group], severity: r.severity, title: r.title, detects: r.detects })),
        null,
        2,
      ),
    );
    return 0;
  }
  console.log(formatRuleList(RULES, findKit()));
  return 0;
}

export function runRule(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      kit: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (values.help || !id) {
    console.log(RULE_HELP);
    return id || values.help ? 0 : 2;
  }
  const rule = ruleById(id);
  if (!rule) {
    console.error(`no rule ${id}; billing-doctor rules lists them`);
    return 2;
  }
  const kitDir = findKit(values.kit);
  if (kitPathIsWrong(values.kit)) process.stderr.write(`--kit ${values.kit} is not a kit folder; it needs a runbook/ directory inside it
`);
  if (values.json) {
    console.log(
      JSON.stringify(
        {
          id: rule.id,
          group: rule.group,
          groupName: GROUPS[rule.group],
          severity: rule.severity,
          title: rule.title,
          detects: rule.detects,
          googleRule: googleRule(rule.id),
          runbook: runbookEntry(kitDir, rule.id) ?? null,
          kit: kitDir ?? null,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  console.log(formatRule(rule, kitDir));
  return 0;
}
