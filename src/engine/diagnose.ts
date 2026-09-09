// Run every rule over a timeline and return the sorted findings. A rule that
// throws is reported as a finding-shaped error on its own id, so one broken
// rule never hides the others.

import { normalizeTimeline, type NormalizedTimeline, type Timeline } from './timeline.js';
import { RULES } from './catalogue.js';
import { googleRule } from '../google/docs.js';
import { sortFindings, summaryLine, exitCodeFor, type Finding } from './findings.js';

export interface DiagnoseOptions {
  // Run only these rule ids (case-insensitive). Default: all.
  rules?: string[];
}

export interface Diagnosis {
  findings: Finding[];
  summary: string;
  exitCode: number;
  errors: string[]; // rules that threw, with the message
  timeline: NormalizedTimeline;
}

function isNormalized(input: Timeline | NormalizedTimeline): input is NormalizedTimeline {
  return (input as NormalizedTimeline).byToken instanceof Map;
}

export function diagnose(input: Timeline | NormalizedTimeline, options: DiagnoseOptions = {}): Diagnosis {
  const timeline = isNormalized(input) ? input : normalizeTimeline(input);
  const wanted = options.rules?.map((id) => id.toUpperCase());
  const findings: Finding[] = [];
  const errors: string[] = [];

  for (const rule of RULES) {
    if (wanted && !wanted.includes(rule.id)) continue;
    let hits;
    try {
      hits = rule.run(timeline);
    } catch (err) {
      errors.push(`${rule.id}: ${(err as Error).message}`);
      continue;
    }
    for (const hit of hits) {
      findings.push({
        ruleId: rule.id,
        severity: hit.severity ?? rule.severity,
        title: rule.title,
        // Ascending, so a reader can scan the file top to bottom; the
        // mechanism text tells the story in order.
        evidence: [...hit.evidence].sort((a, b) => a - b),
        mechanism: hit.mechanism,
        googleRule: googleRule(rule.id),
        fix: `runbook:${rule.id}`,
        confidence: hit.confidence,
        nextCheck: hit.nextCheck,
      });
    }
  }

  const sorted = sortFindings(findings);
  return { findings: sorted, summary: summaryLine(sorted), exitCode: exitCodeFor(sorted), errors, timeline };
}
