// Timeline schema, validation and normalisation.
// Run alone with: node --test tests/timeline.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseTimeline,
  validateTimeline,
  normalizeTimeline,
  emptyTimeline,
  looksLikePseudonym,
  SCHEMA_ID,
  DEFAULT_ACK_WITHIN_HOURS,
} from '../dist/engine/timeline.js';

const example = readFileSync(new URL('../fixtures/example-timeline.json', import.meta.url), 'utf8');

test('the section 4 example validates with no warnings', () => {
  const result = parseTimeline(example);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.warnings, []);
  assert.equal(result.timeline.events.length, 7);
});

test('a real-looking token fails the format check with the redact hint', () => {
  const timeline = JSON.parse(example);
  timeline.events[0].token = 'ahdgfkjsdhfg.AO-J1OyQ7dfnbF6MzmRUq3ExampleRealLookingTokenValue1234567890abcdef';
  const result = validateTimeline(timeline);
  assert.equal(result.ok, true, 'a real token is a warning, not an error');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /events\[0\]\.token/);
  assert.match(result.warnings[0], /billing-doctor redact/);
});

test('an email anywhere in the file is warned about', () => {
  const timeline = JSON.parse(example);
  timeline.events[5].note = 'user someone@example.com says access disappeared';
  const result = validateTimeline(timeline);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /email address/);
});

test('the wrong schema id is an error', () => {
  const timeline = JSON.parse(example);
  timeline.schema = 'billing-doctor-timeline/0';
  const result = validateTimeline(timeline);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /^schema:/);
});

test('a bare local time is refused', () => {
  const timeline = JSON.parse(example);
  timeline.events[0].t = '2026-09-01T10:00:00';
  const result = validateTimeline(timeline);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /^events\.0\.t:/);
});

test('an rtdn event needs a notification kind or a type', () => {
  const timeline = JSON.parse(example);
  timeline.events.push({ t: '2026-09-02T00:00:00Z', kind: 'rtdn', messageId: 'm-9', token: 'tok_a1' });
  const result = validateTimeline(timeline);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /notification/);
});

test('invalid JSON is reported as such', () => {
  const result = parseTimeline('{ not json');
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /not valid JSON/);
});

test('unknown event fields are kept, not refused', () => {
  const timeline = JSON.parse(example);
  timeline.events[0].myOwnNote = 'kept';
  const result = validateTimeline(timeline);
  assert.equal(result.ok, true);
  assert.equal(result.timeline.events[0].myOwnNote, 'kept');
});

test('normalisation sorts by time, keeps file indexes, and indexes by token', () => {
  const timeline = JSON.parse(example);
  // Put the support note first in the file; it is the sixth event by time.
  const support = timeline.events.splice(5, 1)[0];
  timeline.events.unshift(support);
  const normalized = normalizeTimeline(validateTimeline(timeline).timeline);
  assert.equal(normalized.events[0].kind, 'app');
  assert.equal(normalized.events[0].i, 1, 'file index survives sorting');
  assert.equal(normalized.events[5].kind, 'support');
  assert.equal(normalized.events[5].i, 0);
  assert.equal(normalized.byToken.get('tok_a1').length, 5);
  assert.equal(normalized.policy.ackWithinHours, 72);
  assert.equal(normalized.startMs, Date.parse('2026-09-01T10:00:00Z'));
  assert.equal(normalized.endMs, Date.parse('2026-09-14T08:30:00Z'));
});

test('an rtdn event with only a notificationType is a subscription notification', () => {
  const normalized = normalizeTimeline(parseTimeline(example).timeline);
  const rtdn = normalized.events.find((e) => e.kind === 'rtdn');
  assert.equal(rtdn.notification, 'subscription');
});

test('policy defaults apply when the block is missing', () => {
  const normalized = normalizeTimeline(validateTimeline({ schema: SCHEMA_ID, events: [] }).timeline);
  assert.deepEqual(normalized.policy.grantOn, [
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED',
  ]);
  assert.equal(normalized.policy.ackWithinHours, DEFAULT_ACK_WITHIN_HOURS);
  assert.equal(normalized.policy.refetchOnEveryNotification, undefined, 'unknown stays unknown');
});

test('emptyTimeline validates', () => {
  const result = validateTimeline(emptyTimeline({ packageName: 'com.example.app' }));
  assert.equal(result.ok, true);
  assert.equal(result.timeline.events.length, 0);
});

test('pseudonym check', () => {
  assert.equal(looksLikePseudonym('tok_a1'), true);
  assert.equal(looksLikePseudonym('tok_9f3c'), true);
  assert.equal(looksLikePseudonym('abc'), false);
  assert.equal(looksLikePseudonym('tok_'), false);
});
