// `billing-doctor validate timeline.json`: check a file against the schema and
// print what is wrong or what should not be in it. Exit 0 when the file is
// usable, 1 when it is not. Warnings do not change the exit code, because a
// timeline with a real-looking token can still be diagnosed; it just must not
// be shared.

import { readFileSync } from 'node:fs';
import { parseTimeline } from '../engine/timeline.js';

export const VALIDATE_HELP = `Usage: billing-doctor validate <timeline.json>

Checks the file against the billing-doctor-timeline/1 schema.`;

export function runValidate(argv: string[]): number {
  const file = argv[0];
  if (!file || file === '--help' || file === '-h') {
    console.log(VALIDATE_HELP);
    return file ? 0 : 2;
  }
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`cannot read ${file}: ${(err as Error).message}`);
    return 2;
  }
  const result = parseTimeline(text);
  for (const warning of result.warnings) console.log(`warning: ${warning}`);
  if (!result.ok) {
    for (const error of result.errors) console.error(`error: ${error}`);
    console.error(`${file}: ${result.errors.length} error(s)`);
    return 1;
  }
  const n = result.timeline!.events.length;
  console.log(`${file}: valid, ${n} event(s), ${result.warnings.length} warning(s)`);
  return 0;
}
