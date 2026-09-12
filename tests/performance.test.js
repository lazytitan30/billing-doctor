// Wall-clock tests, which are unusual and earn their place here.
//
// An adversarial review on 2026-09-12 found three super-linear paths. None was
// visible to the unit tests, which use small fixtures, or to the fuzzer, which
// generates at most six events per timeline. They only appear at size:
//
//   a 125 kB timeline took six seconds to validate, and scaled ×4 per doubling
//   4,800 events took 23 seconds in one rule, and scaled ×7 per doubling
//
// That matters more than it looks. The MCP server does this work synchronously
// on the event loop, so one crafted argument freezes every other tool call for
// as long as the attacker chose. An agent handed a malicious document is the
// realistic way that argument arrives.
//
// The limits below are deliberately loose. They are there to catch a return to
// quadratic behaviour, not to police milliseconds on a busy machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTimeline } from '../dist/index.js';
import { diagnose } from '../dist/engine/diagnose.js';
import { redact } from '../dist/redact.js';

function elapsed(fn) {
  const started = Date.now();
  fn();
  return Date.now() - started;
}

test('a long run of dotted labels does not make validation quadratic', () => {
  // The shape that caused it: an almost-email whose tail never matches, so the
  // engine retried every split point at every start offset.
  const payload = `x@a${'.a'.repeat(64 * 512)}.!`;
  const timeline = {
    schema: 'billing-doctor-timeline/1',
    events: [{ kind: 'support', t: '2026-01-01T00:00:00Z', note: payload }],
  };
  const ms = elapsed(() => validateTimeline(timeline));
  assert.ok(ms < 2000, `validating a 128kB timeline took ${ms}ms; it was 6000ms when the email pattern was unbounded`);
});

test('validation time grows roughly with size, not with its square', () => {
  const build = (kb) => ({
    schema: 'billing-doctor-timeline/1',
    events: [{ kind: 'support', t: '2026-01-01T00:00:00Z', note: `x@a${'.a'.repeat(kb * 512)}.!` }],
  });
  const small = Math.max(elapsed(() => validateTimeline(build(32))), 1);
  const large = Math.max(elapsed(() => validateTimeline(build(128))), 1);
  // Four times the input. Linear would be about 4x, quadratic about 16x.
  assert.ok(large / small < 10, `4x the input took ${(large / small).toFixed(1)}x the time (${small}ms then ${large}ms), which looks quadratic`);
});

test('thousands of events diagnose in reasonable time', () => {
  // The shape that made E2 cubic: many restart notifications for one token with
  // no ledger row after them, many ledger rows for the same user under other
  // tokens, and the purchase results last so the inner scan never short-circuits.
  const events = [];
  const at = (n) => new Date(Date.parse('2026-01-01T00:00:00Z') + n * 1000).toISOString().replace('.000Z', 'Z');
  let n = 0;
  for (let i = 0; i < 600; i += 1) {
    events.push({ t: at(n += 1), kind: 'rtdn', notification: 'subscription', notificationType: 7, messageId: `m-${i}`, eventTimeMillis: Date.parse(at(n)), token: 'tok_a1' });
  }
  for (let i = 0; i < 600; i += 1) {
    events.push({ t: at(n += 1), kind: 'ledger', op: 'grant', token: `tok_b${i}`, userId: 'u_1' });
  }
  for (let i = 0; i < 600; i += 1) {
    events.push({ t: at(n += 1), kind: 'app', type: 'purchase_result', token: `tok_c${i}`, productId: 'basic_monthly', purchaseState: 'PURCHASED' });
  }
  const parsed = validateTimeline({ schema: 'billing-doctor-timeline/1', events });
  assert.equal(parsed.ok, true, parsed.errors?.join('; '));
  const ms = elapsed(() => diagnose(parsed.timeline));
  assert.ok(ms < 5000, `diagnosing 1,800 events took ${ms}ms; E2 alone took 23,000ms on 4,800 before the inner scan was hoisted`);
});

test('redact stays linear on a large log', () => {
  // redact runs several patterns over whatever somebody pastes, and people
  // paste megabytes. A backtracking pattern here hangs in front of them.
  const text = `${'user logged in at 10:00 with token tok_a1 and mail dev@example.com\n'.repeat(4000)}`;
  const ms = elapsed(() => redact(text));
  assert.ok(ms < 3000, `redacting ${Math.round(text.length / 1000)}kB took ${ms}ms`);
});
