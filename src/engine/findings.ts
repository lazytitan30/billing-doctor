// Findings: the shape every rule produces, how they are ordered, what the exit
// code is, and how they print. A finding is only as good as its evidence, so
// the text output leads with the events it rests on.

import type { GoogleRule } from '../google/docs.js';
import type { NormalizedEvent, NormalizedTimeline } from './timeline.js';
import { describeEvent } from './helpers.js';

export type Severity = 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'certain' | 'likely' | 'possible';

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  evidence: number[]; // file indexes into timeline.events
  mechanism: string;
  googleRule: GoogleRule;
  fix: string; // "runbook:B1"
  confidence: Confidence;
  nextCheck: string;
}

export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'info'];

function firstEvidence(finding: Finding): number {
  return finding.evidence.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...finding.evidence);
}

// Severity first, then the earliest event cited, then the rule id. A finding
// with no event evidence (a configuration finding) sorts after event findings
// of the same severity.
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      firstEvidence(a) - firstEvidence(b) ||
      a.ruleId.localeCompare(b.ruleId, 'en', { numeric: true }),
  );
}

// Exit 1 when any high finding exists, so the command can gate CI.
export function exitCodeFor(findings: Finding[]): number {
  return findings.some((f) => f.severity === 'high') ? 1 : 0;
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function summaryLine(findings: Finding[]): string {
  if (findings.length === 0) return 'no findings';
  const counts = countBySeverity(findings);
  const parts = SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  return `${findings.length} finding${findings.length === 1 ? '' : 's'}: ${parts.join(', ')}`;
}

const INDENT = '      ';

function wrap(label: string, text: string): string {
  return `${INDENT}${label.padEnd(10)}${text}`;
}

// Plain text for people. Grouped by severity, in the sorted order.
export function formatFindings(findings: Finding[], timeline?: NormalizedTimeline): string {
  const lines: string[] = [];
  const byIndex = new Map<number, NormalizedEvent>();
  if (timeline) for (const e of timeline.events) byIndex.set(e.i, e);

  for (const severity of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(severity.toUpperCase());
    for (const f of group) {
      lines.push(`  ${f.ruleId.padEnd(4)}${f.title}  [${f.confidence}]`);
      if (f.evidence.length === 0) {
        lines.push(wrap('evidence', 'configuration, no single event'));
      } else {
        f.evidence.forEach((index, n) => {
          const event = byIndex.get(index);
          const text = event ? describeEvent(event) : `#${index}`;
          lines.push(n === 0 ? wrap('evidence', text) : `${INDENT}${''.padEnd(10)}${text}`);
        });
      }
      lines.push(wrap('mechanism', f.mechanism));
      lines.push(wrap('Google', `"${f.googleRule.quote}"`));
      lines.push(`${INDENT}${''.padEnd(10)}${f.googleRule.title}, read ${f.googleRule.readOn}: ${f.googleRule.url}`);
      if (f.googleRule.observed) lines.push(wrap('observed', f.googleRule.observed));
      lines.push(wrap('next', f.nextCheck));
      lines.push(wrap('fix', `${f.fix.replace('runbook:', 'runbook ')} (billing-doctor rule ${f.ruleId})`));
      lines.push('');
    }
  }
  lines.push(summaryLine(findings));
  return lines.join('\n');
}
