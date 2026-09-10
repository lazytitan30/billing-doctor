import { defineRule } from '../rule.js';
import { MIN_MS, isApp, isLedger, precedes } from '../helpers.js';
import { failedWith } from './deviceCodes.js';

const WINDOW_MS = MIN_MS;

// A cancellation is an outcome, not a fault. Google lists it as not retriable.
export const K14 = defineRule({
  id: 'K14',
  group: 'K',
  severity: 'low',
  title: 'A user cancellation retried or reported as an error',
  detects:
    'A call that ended in USER_CANCELED, followed within a minute by another attempt at the same operation, or by a client response of error. The user said no; the app should accept that quietly.',
  run(tl) {
    const hits = [];
    for (const e of tl.events) {
      const outcome = failedWith(e, 1);
      if (!outcome || !isApp(e)) continue;
      const retry = tl.events.find(
        (r) => isApp(r) && r.type === e.type && precedes(e, r) && r.tMs <= e.tMs + WINDOW_MS,
      );
      const errored = tl.events.find(
        (r) => isLedger(r) && r.op === 'client_response' && r.result === 'error' && precedes(e, r) && r.tMs <= e.tMs + WINDOW_MS,
      );
      if (!retry && !errored) continue;
      const followed = (retry ?? errored)!;
      hits.push({
        evidence: [e.i, followed.i],
        confidence: outcome.exact ? ('certain' as const) : ('likely' as const),
        mechanism: `The user cancelled at #${e.i}${outcome.exact ? '' : ' (read from the error text, since no response code was recorded)'}, and #${followed.i} ${retry ? 'launched the same operation again' : 'reported an error to the client'}.`,
        nextCheck: `Treat a cancellation as a normal ending: close the sheet, no error dialog, no retry. Check every shape your wrapper reports it in, since some report a code and some only a message, and an unrecognised cancellation falls into the error path where raw purchase data can end up in front of the user.`,
      });
    }
    return hits;
  },
});
