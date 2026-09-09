// The rule registry, in group order. Adding a rule means adding its file, its
// Google fact in src/google/docs.ts, its fixture, and one line here.

import type { Rule } from './rule.js';
import { B1 } from './rules/B1.js';
import { B2 } from './rules/B2.js';
import { B3 } from './rules/B3.js';
import { B4 } from './rules/B4.js';
import { B5 } from './rules/B5.js';
import { B6 } from './rules/B6.js';
import { B7 } from './rules/B7.js';
import { B8 } from './rules/B8.js';
import { B9 } from './rules/B9.js';
import { C1 } from './rules/C1.js';
import { C2 } from './rules/C2.js';
import { C3 } from './rules/C3.js';
import { C4 } from './rules/C4.js';
import { C5 } from './rules/C5.js';
import { C6 } from './rules/C6.js';
import { C7 } from './rules/C7.js';

export const GROUPS: Record<string, string> = {
  A: 'Configuration and permissions',
  B: 'Purchase and acknowledgement',
  C: 'Notifications',
  D: 'State interpretation',
  E: 'Lifecycle events',
  F: 'Upgrades and linked tokens',
  G: 'Refunds, revocations, voided purchases',
  H: 'Account binding and restore',
  I: 'Testing and Console',
  J: 'Ledger integrity, retention, redaction',
};

export const RULES: Rule[] = [B1, B2, B3, B4, B5, B6, B7, B8, B9, C1, C2, C3, C4, C5, C6, C7];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.id === id.toUpperCase());
}
