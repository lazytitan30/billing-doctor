// The Incident Kit is a folder of files. Its presence unlocks the runbook text
// inside the CLI and MCP output; there is no licence server, no key, no
// phone-home. Looked for, in order: an explicit --kit path, the
// BILLING_DOCTOR_KIT environment variable, and ./billing-doctor-kit in the
// working directory.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const KIT_FOLDER = 'billing-doctor-kit';

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isKit(candidate: string): boolean {
  const path = resolve(candidate);
  return isDir(path) && isDir(join(path, 'runbook'));
}

// An explicit --kit is the answer, right or wrong. Falling back to a kit found
// somewhere else would quietly read a different folder than the one asked for,
// which is worse than saying nothing: the reader would trust runbook text that
// did not come from where they pointed.
export function findKit(explicit?: string, env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | undefined {
  if (explicit) return isKit(explicit) ? resolve(explicit) : undefined;
  for (const candidate of [env.BILLING_DOCTOR_KIT, join(cwd, KIT_FOLDER)].filter((p): p is string => Boolean(p))) {
    if (isKit(candidate)) return resolve(candidate);
  }
  return undefined;
}

// True when the reader named a folder that is not a kit, so a command can say
// so rather than leaving them wondering why the runbook never appears.
export function kitPathIsWrong(explicit?: string): boolean {
  return Boolean(explicit) && !isKit(explicit as string);
}

// The runbook entry for a rule, when the kit is present. Returns undefined
// when there is no kit or no entry; the caller prints the pointer instead.
export function runbookEntry(kitDir: string | undefined, ruleId: string): string | undefined {
  if (!kitDir) return undefined;
  const file = join(kitDir, 'runbook', `${ruleId.toUpperCase()}.md`);
  if (!existsSync(file)) return undefined;
  return readFileSync(file, 'utf8');
}

export const KIT_POINTER =
  'The Incident Kit adds the runbook page for this rule: the symptom as the user reports it, the mechanism, the fix, and the regression test to add. ' +
  'It is one page per rule, forty real incident timelines to replay against your own handler in CI, and a TypeScript reference backend that passes all of them. ' +
  'Files, not a service: no licence server and no phone-home. https://billingdoctor.dev';

// One line, for places where the long form would be noise.
export const KIT_LINE = 'The Incident Kit adds a runbook page to each rule, with the fix and the regression test: https://billingdoctor.dev';
