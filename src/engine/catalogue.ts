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
import { D1 } from './rules/D1.js';
import { D2 } from './rules/D2.js';
import { D3 } from './rules/D3.js';
import { D4 } from './rules/D4.js';
import { D5 } from './rules/D5.js';
import { D6 } from './rules/D6.js';
import { D7 } from './rules/D7.js';
import { D8 } from './rules/D8.js';
import { D9 } from './rules/D9.js';
import { D10 } from './rules/D10.js';
import { E1 } from './rules/E1.js';
import { E2 } from './rules/E2.js';
import { E3 } from './rules/E3.js';
import { E4 } from './rules/E4.js';
import { E5 } from './rules/E5.js';
import { E6 } from './rules/E6.js';
import { F1 } from './rules/F1.js';
import { F2 } from './rules/F2.js';
import { F3 } from './rules/F3.js';
import { F4 } from './rules/F4.js';
import { G1 } from './rules/G1.js';
import { G2 } from './rules/G2.js';
import { G3 } from './rules/G3.js';
import { G4 } from './rules/G4.js';
import { G5 } from './rules/G5.js';
import { G6 } from './rules/G6.js';
import { A1 } from './rules/A1.js';
import { A2 } from './rules/A2.js';
import { A3 } from './rules/A3.js';
import { A4 } from './rules/A4.js';
import { A5 } from './rules/A5.js';
import { A6 } from './rules/A6.js';
import { H1 } from './rules/H1.js';
import { H2 } from './rules/H2.js';
import { H3 } from './rules/H3.js';
import { H4 } from './rules/H4.js';
import { H5 } from './rules/H5.js';
import { H6 } from './rules/H6.js';
import { I1 } from './rules/I1.js';
import { I2 } from './rules/I2.js';
import { I3 } from './rules/I3.js';
import { I4 } from './rules/I4.js';
import { I5 } from './rules/I5.js';
import { J1 } from './rules/J1.js';
import { J2 } from './rules/J2.js';
import { J3 } from './rules/J3.js';
import { J4 } from './rules/J4.js';

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

export const RULES: Rule[] = [
  A1, A2, A3, A4, A5, A6,
  B1, B2, B3, B4, B5, B6, B7, B8, B9,
  C1, C2, C3, C4, C5, C6, C7,
  D1, D2, D3, D4, D5, D6, D7, D8, D9, D10,
  E1, E2, E3, E4, E5, E6,
  F1, F2, F3, F4,
  G1, G2, G3, G4, G5, G6,
  H1, H2, H3, H4, H5, H6,
  I1, I2, I3, I4, I5,
  J1, J2, J3, J4,
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.id === id.toUpperCase());
}
