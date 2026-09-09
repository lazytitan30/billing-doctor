// Billing Doctor: library entry point.
//
// The CLI and the MCP server both call into what is exported from here, so a
// behaviour that a test can reach through this file is the behaviour users get.
// Nothing in this package opens a network connection unless the developer
// passes --fetch with their own credentials (built last, documented as optional).

export const VERSION = '0.1.0';

export {
  SCHEMA_ID,
  parseTimeline,
  validateTimeline,
  normalizeTimeline,
  emptyTimeline,
  looksLikePseudonym,
} from './engine/timeline.js';
export type { Timeline, TimelineEvent, NormalizedTimeline, NormalizedEvent, ValidationResult } from './engine/timeline.js';

export { diagnose } from './engine/diagnose.js';
export type { Diagnosis, DiagnoseOptions } from './engine/diagnose.js';
export { sortFindings, exitCodeFor, formatFindings, summaryLine } from './engine/findings.js';
export type { Finding, Severity, Confidence } from './engine/findings.js';
export { RULES, GROUPS, ruleById } from './engine/catalogue.js';
export type { Rule, RuleHit } from './engine/rule.js';

export { decodeRtdn, describeRtdn, SUBSCRIPTION_NOTIFICATION_TYPES, ONE_TIME_NOTIFICATION_TYPES } from './google/rtdn.js';
export type { DecodedRtdn, DeveloperNotification } from './google/rtdn.js';

export { explainSubscription, SUBSCRIPTION_STATE_INFO } from './google/states.js';
export type { SubscriptionResource, Explanation } from './google/states.js';

export { GOOGLE_RULES, googleRule, READ_ON } from './google/docs.js';
export type { GoogleRule } from './google/docs.js';
