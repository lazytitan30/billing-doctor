// `billing-doctor init`: write an empty timeline with the policy block filled
// from a few questions. The answers are what the rules later hold the backend
// to, so the questions are phrased the way a developer would describe their own
// policy, not the way Google names states.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { emptyTimeline, DEFAULT_GRANT_ON, DEFAULT_REVOKE_ON, type Policy, type Config } from '../engine/timeline.js';

const DEFAULT_HANDLED_TYPES = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 19, 20];

interface Answers {
  packageName: string;
  backend: string;
  billingLibrary: string;
  grantInGrace: boolean;
  grantWhileCanceled: boolean;
  ackWithinHours: number;
  refetch: boolean;
  voidedSweep: boolean;
  pushEndpointAuth: 'none' | 'oidc' | 'shared-secret';
  topicProject: string;
  handledTypes: number[];
}

const DEFAULTS: Answers = {
  packageName: 'com.example.app',
  backend: 'node',
  billingLibrary: '8.0.0',
  grantInGrace: true,
  grantWhileCanceled: true,
  ackWithinHours: 72,
  refetch: true,
  voidedSweep: true,
  pushEndpointAuth: 'none',
  topicProject: '',
  handledTypes: DEFAULT_HANDLED_TYPES,
};

export const INIT_HELP = `Usage: billing-doctor init [--out timeline.json] [--yes] [--force]

Writes an empty timeline with the policy block filled from a few questions.
  --out <file>   where to write (default: timeline.json)
  --yes          take every default without asking (also when stdin is not a terminal)
  --force        overwrite an existing file`;

function yesNo(answer: string, fallback: boolean): boolean {
  const a = answer.trim().toLowerCase();
  if (a === '') return fallback;
  return a === 'y' || a === 'yes';
}

async function ask(): Promise<Answers> {
  const rl = createInterface({ input: stdin, output: stdout });
  const q = async (prompt: string, fallback: string) => {
    const answer = await rl.question(`${prompt} [${fallback}] `);
    return answer.trim() === '' ? fallback : answer.trim();
  };
  try {
    const packageName = await q('Package name', DEFAULTS.packageName);
    const backend = await q('Backend language (node, python, php, go, java)', DEFAULTS.backend);
    const billingLibrary = await q('Billing Library version in the current release', DEFAULTS.billingLibrary);
    const grantInGrace = yesNo(await q('Do you keep access during the grace period? (y/n)', 'y'), true);
    const grantWhileCanceled = yesNo(
      await q('Do you keep access after a cancellation until the expiry date? (y/n)', 'y'),
      true,
    );
    const ackWithinHours = Number(await q('Within how many hours do you acknowledge a purchase?', '72')) || 72;
    const refetch = yesNo(await q('Do you re-fetch the purchase from Google on every notification? (y/n)', 'y'), true);
    const voidedSweep = yesNo(await q('Do you call voidedpurchases.list at least every 30 days? (y/n)', 'y'), true);
    const auth = await q('How is the Pub/Sub push endpoint authenticated? (none, oidc, shared-secret)', 'none');
    const pushEndpointAuth = (['none', 'oidc', 'shared-secret'].includes(auth) ? auth : 'none') as Answers['pushEndpointAuth'];
    const topicProject = await q('Cloud project that holds the RTDN topic (blank if the same as the app)', '');
    const typesAnswer = await q('Notification types your handler switches on', DEFAULT_HANDLED_TYPES.join(','));
    const handledTypes = typesAnswer
      .split(/[,\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n));
    return {
      packageName,
      backend,
      billingLibrary,
      grantInGrace,
      grantWhileCanceled,
      ackWithinHours,
      refetch,
      voidedSweep,
      pushEndpointAuth,
      topicProject,
      handledTypes,
    };
  } finally {
    rl.close();
  }
}

export function timelineFromAnswers(a: Answers) {
  const grantOn = DEFAULT_GRANT_ON.filter((state) => {
    if (state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') return a.grantInGrace;
    if (state === 'SUBSCRIPTION_STATE_CANCELED') return a.grantWhileCanceled;
    return true;
  });
  const revokeOn = [...DEFAULT_REVOKE_ON];
  if (!a.grantInGrace) revokeOn.push('SUBSCRIPTION_STATE_IN_GRACE_PERIOD');
  if (!a.grantWhileCanceled) revokeOn.push('SUBSCRIPTION_STATE_CANCELED');
  const policy: Policy = {
    grantOn,
    revokeOn,
    ackWithinHours: a.ackWithinHours,
    refetchOnEveryNotification: a.refetch,
    handledNotificationTypes: a.handledTypes,
    voidedPurchasesSweep: a.voidedSweep,
  };
  const config: Config = { rtdn: { pushEndpointAuth: a.pushEndpointAuth } };
  if (a.topicProject) config.rtdn!.topicProject = a.topicProject;
  return emptyTimeline({
    packageName: a.packageName,
    backend: a.backend,
    billingLibrary: a.billingLibrary,
    policy,
    config,
  });
}

export async function runInit(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string', default: 'timeline.json' },
      yes: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(INIT_HELP);
    return 0;
  }
  const out = values.out as string;
  if (existsSync(out) && !values.force) {
    console.error(`${out} exists; pass --force to overwrite it`);
    return 2;
  }
  const answers = values.yes || !stdin.isTTY ? DEFAULTS : await ask();
  const timeline = timelineFromAnswers(answers);
  writeFileSync(out, `${JSON.stringify(timeline, null, 2)}\n`);
  console.log(`wrote ${out}. Add events in time order; the format is described in docs/timeline-format.md.`);
  return 0;
}
