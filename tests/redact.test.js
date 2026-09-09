// Redaction: a pasted log with a fake token and an email comes out clean.
// Run alone with: node --test tests/redact.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { redact, pseudonymForToken, maskOrderId } from '../dist/redact.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

// Synthetic, shaped like the real thing: a lowercase prefix, a dot, AO-J1, a long tail.
const FAKE_TOKEN = 'abcdefghijklmnopqrstuvwx.AO-J1OyExampleSyntheticTokenValue0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP';

test('a purchase token becomes a stable tok_ pseudonym', () => {
  const line = `RTDN for ${FAKE_TOKEN} type 13`;
  const once = redact(line);
  const twice = redact(`${line}\nagain ${FAKE_TOKEN}`);
  assert.doesNotMatch(once.text, /AO-J1/);
  assert.match(once.text, /^RTDN for tok_[0-9a-f]{6} type 13$/);
  assert.equal(once.counts.tokens, 1);
  assert.equal(twice.counts.tokens, 2);
  const [a, b] = twice.text.match(/tok_[0-9a-f]{6}/g);
  assert.equal(a, b, 'the same token reads the same everywhere');
  assert.equal(a, pseudonymForToken(FAKE_TOKEN));
  assert.notEqual(pseudonymForToken(FAKE_TOKEN, 'salt'), pseudonymForToken(FAKE_TOKEN), 'a salt changes the pseudonym');
});

test('emails are removed, order ids keep the last four, UUIDs become u_ pseudonyms', () => {
  const r = redact('user someone@example.com order GPA.1234-5678-9012-34567 id 123e4567-e89b-12d3-a456-426614174000');
  assert.equal(r.text, 'user [email] order GPA.****-****-****-*4567 id u_' + r.text.match(/u_([0-9a-f]{6})/)[1]);
  assert.deepEqual(r.counts, { tokens: 0, emails: 1, orderIds: 1, userIds: 1, secrets: 0 });
  assert.equal(maskOrderId('GPA.1234-5678-9012-34567'), 'GPA.****-****-****-*4567');
});

test('secrets are cut out: private keys, service-account fields, bearer and OAuth tokens', () => {
  const key = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----';
  const r = redact(`{"private_key_id": "abc123", "private_key": "${key}", "client_email": "svc@example.iam.gserviceaccount.com"}\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789\ntoken ya29.a0AfH6SMBexampleexampleexample`);
  assert.doesNotMatch(r.text, /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(r.text, /abc123/);
  assert.doesNotMatch(r.text, /ya29\.a0/);
  assert.match(r.text, /Bearer \[removed\]/);
  assert.ok(r.counts.secrets >= 4, `secrets counted: ${r.counts.secrets}`);
});

test('a very long token-shaped blob without the AO-J1 marker is still replaced', () => {
  const blob = 'x'.repeat(100);
  const r = redact(`token=${blob} done`);
  assert.match(r.text, /^token=tok_[0-9a-f]{6} done$/);
});

test('ordinary text passes through untouched', () => {
  const text = 'SUBSCRIPTION_STATE_CANCELED at 2026-09-01T10:00:00Z for tok_a1, user u_1, GPA.****-****-****-*0000';
  const r = redact(text);
  assert.equal(r.text, text);
  assert.deepEqual(r.counts, { tokens: 0, emails: 0, orderIds: 0, userIds: 0, secrets: 0 });
});

test('the redact command reads stdin, prints clean text, and counts on stderr', () => {
  const run = spawnSync(process.execPath, [cli, 'redact'], {
    encoding: 'utf8',
    input: `purchase ${FAKE_TOKEN} by someone@example.com\n`,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^purchase tok_[0-9a-f]{6} by \[email\]\n$/);
  assert.match(run.stderr, /redacted 1 token, 1 email/);
  const quiet = spawnSync(process.execPath, [cli, 'redact', '--quiet'], { encoding: 'utf8', input: 'nothing here' });
  assert.equal(quiet.stderr, '');
  assert.equal(quiet.stdout, 'nothing here');
});
