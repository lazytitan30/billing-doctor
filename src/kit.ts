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

export function findKit(explicit?: string, env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | undefined {
  const candidates = [explicit, env.BILLING_DOCTOR_KIT, join(cwd, KIT_FOLDER)].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    const path = resolve(candidate);
    if (isDir(path) && isDir(join(path, 'runbook'))) return path;
  }
  return undefined;
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
  'The Incident Kit adds a runbook entry here: the symptom as the user reports it, the mechanism, the fix, and the regression test to add. It is a folder of files; drop it next to the tool as ./billing-doctor-kit or point BILLING_DOCTOR_KIT at it.';
