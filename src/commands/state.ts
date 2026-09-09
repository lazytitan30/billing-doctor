// `billing-doctor state sub.json`: explain a SubscriptionPurchaseV2 resource in
// plain words. Optionally applies the developer's policy from a timeline file
// so the output says where the policy and Google disagree.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { explainSubscription, type SubscriptionResource } from '../google/states.js';
import { parseTimeline } from '../engine/timeline.js';

export const STATE_HELP = `Usage: billing-doctor state <subscription.json | -> [--policy timeline.json] [--now <iso time>] [--json]

Explains a purchases.subscriptionsv2 resource: the state, the access it implies,
the expiry of each item, the acknowledgement deadline, the linked token, the
test marker, the plan type and the cancellation context.
  --policy <file>  read grantOn and revokeOn from a timeline and compare
  --now <time>     evaluate deadlines at this time instead of the clock
  --json           print the explanation as JSON`;

export function runState(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      policy: { type: 'string' },
      now: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (values.help || !file) {
    console.log(STATE_HELP);
    return file || values.help ? 0 : 2;
  }
  let resource: SubscriptionResource;
  try {
    const text = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
    resource = JSON.parse(text);
  } catch (err) {
    console.error(`cannot read ${file}: ${(err as Error).message}`);
    return 2;
  }
  let grantOn: string[] | undefined;
  let revokeOn: string[] | undefined;
  if (values.policy) {
    const result = parseTimeline(readFileSync(values.policy, 'utf8'));
    if (!result.ok) {
      console.error(`${values.policy}: ${result.errors.join('; ')}`);
      return 2;
    }
    grantOn = result.timeline!.policy?.grantOn;
    revokeOn = result.timeline!.policy?.revokeOn;
  }
  let now: Date | undefined;
  if (values.now) {
    now = new Date(values.now);
    if (Number.isNaN(now.getTime())) {
      console.error(`--now is not a time: ${values.now}`);
      return 2;
    }
  }
  const explanation = explainSubscription(resource, { grantOn, revokeOn, now });
  if (values.json) {
    console.log(JSON.stringify(explanation, null, 2));
  } else {
    for (const line of explanation.lines) console.log(line);
  }
  return 0;
}
