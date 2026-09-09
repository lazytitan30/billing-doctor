// What a rule is. Each rule is a pure function of the normalised timeline that
// returns hits; the engine turns hits into findings by adding the rule's id,
// title, severity, Google's quote and the runbook pointer. Rules never call
// each other and never read anything but the timeline.

import type { NormalizedTimeline } from './timeline.js';
import type { Severity, Confidence } from './findings.js';

export interface RuleHit {
  evidence: number[];
  mechanism: string;
  confidence: Confidence;
  nextCheck: string;
  // A rule may lower or raise its severity for one hit (A5 does).
  severity?: Severity;
}

export interface Rule {
  id: string;
  group: string;
  severity: Severity;
  title: string;
  // Two sentences: what it detects and why it matters. If a rule needs more,
  // it is two rules or none.
  detects: string;
  run(timeline: NormalizedTimeline): RuleHit[];
}

export function defineRule(rule: Rule): Rule {
  return rule;
}
