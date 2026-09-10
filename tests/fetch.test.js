// --fetch against a local stub of Google's token endpoint and the Play
// Developer API. The stub verifies the JWT with the public half of a key
// generated for the test, so the signing is exercised for real; nothing
// reaches the network. The CLI is spawned asynchronously: the stub lives in
// this process, so a blocking spawn would deadlock.
// Run alone with: node --test tests/fetch.test.js (after npm run build)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchForTimeline, signJwt, loadServiceAccount, SCOPE } from '../dist/fetch.js';
import { FIXTURES } from './fixtures.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const dir = mkdtempSync(join(tmpdir(), 'billing-doctor-fetch-'));
const saPath = join(dir, 'service-account.json');
const mapPath = join(dir, 'tokens.json');
const REAL = 'abcdefghijklmnopqrstuvwx.AO-J1OySyntheticRealLookingTokenForTheStub0123456789abcdefghijklmnopqrstuv';
const LINKED_REAL = 'zyxwvutsrqponmlkjihgfedc.AO-J1OyAnotherSyntheticTokenValue0123456789abcdefghijklmnopqrstuvwxyzAB';

writeFileSync(saPath, JSON.stringify({ type: 'service_account', client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
writeFileSync(mapPath, JSON.stringify({ tok_a1: REAL }));

let server;
let base;
const seen = { tokenRequests: 0, apiRequests: [] };

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/token') {
        seen.tokenRequests += 1;
        const params = new URLSearchParams(body);
        const [h, c, s] = params.get('assertion').split('.');
        const verify = createVerify('RSA-SHA256');
        verify.update(`${h}.${c}`);
        const ok = verify.verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
        const claims = JSON.parse(Buffer.from(c, 'base64').toString('utf8'));
        if (!ok || claims.scope !== SCOPE || claims.iss !== 'svc@example.iam.gserviceaccount.com' || claims.aud !== `${base}/token`) {
          res.writeHead(401).end('bad assertion');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: 'stub-access-token', token_type: 'Bearer' }));
        return;
      }
      const m = /^\/androidpublisher\/v3\/applications\/([^/]+)\/purchases\/subscriptionsv2\/tokens\/([^/]+)$/.exec(req.url);
      if (req.method === 'GET' && m) {
        seen.apiRequests.push({ pkg: decodeURIComponent(m[1]), token: decodeURIComponent(m[2]), auth: req.headers.authorization });
        if (req.headers.authorization !== 'Bearer stub-access-token') return res.writeHead(401).end();
        if (decodeURIComponent(m[2]) !== REAL) return res.writeHead(404).end('{}');
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            kind: 'androidpublisher#subscriptionPurchaseV2',
            subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
            acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
            lineItems: [{ productId: 'basic_monthly', expiryTime: '2026-10-01T10:00:00Z', autoRenewingPlan: { autoRenewEnabled: false } }],
            linkedPurchaseToken: LINKED_REAL,
            testPurchase: {},
            externalAccountIdentifiers: { obfuscatedExternalAccountId: 'hm_1' },
            canceledStateContext: { systemInitiatedCancellation: {} },
          }),
        );
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  // Keep-alive connections from fetch would keep the process alive; drop them.
  server.closeAllConnections();
  server.close();
});

test('the JWT is signed with the key and carries the scope, issuer and audience', () => {
  const account = loadServiceAccount(saPath);
  const jwt = signJwt(account, { tokenUrl: 'https://oauth2.googleapis.com/token', nowMs: Date.parse('2026-09-10T00:00:00Z') });
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64').toString()), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(c, 'base64').toString());
  assert.equal(claims.scope, SCOPE);
  assert.equal(claims.exp - claims.iat, 3600);
  const verify = createVerify('RSA-SHA256');
  verify.update(`${h}.${c}`);
  assert.equal(verify.verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), true);
  assert.throws(() => loadServiceAccount(mapPath), /not a service-account key file/);
});

test('fetchForTimeline appends Google\'s answers under the pseudonym and never writes the real token', async () => {
  const timeline = JSON.parse(readFileSync(join(FIXTURES, 'clean', '01-purchase-renew-cancel-expire.json'), 'utf8'));
  const result = await fetchForTimeline(timeline, {
    serviceAccountPath: saPath,
    tokenMap: { tok_a1: REAL },
    now: new Date('2026-09-10T12:00:00Z'),
    tokenUrl: `${base}/token`,
    apiBase: base,
  });
  assert.deepEqual(result.fetched, [{ token: 'tok_a1', status: 200 }]);
  assert.deepEqual(result.skipped, []);
  const added = result.timeline.events.at(-1);
  assert.equal(added.kind, 'api');
  assert.equal(added.call, 'subscriptionsv2.get');
  assert.equal(added.token, 'tok_a1');
  assert.equal(added.t, '2026-09-10T12:00:00Z');
  assert.equal(added.subscriptionState, 'SUBSCRIPTION_STATE_EXPIRED');
  assert.equal(added.testPurchase, true);
  assert.equal(added.canceledStateContext, 'systemInitiatedCancellation');
  assert.match(added.linkedPurchaseToken, /^tok_[0-9a-f]{6}$/, 'a linked real token is pseudonymised');
  const text = JSON.stringify(result.timeline);
  assert.equal(text.includes(REAL), false);
  assert.equal(text.includes(LINKED_REAL), false);
  assert.equal(seen.tokenRequests, 1);
  assert.equal(seen.apiRequests.at(-1).pkg, 'com.example.app');
});

test('pseudonyms without a map entry are skipped; a real-looking token in the timeline is fetched and pseudonymised', async () => {
  const timeline = JSON.parse(readFileSync(join(FIXTURES, 'clean', '01-purchase-renew-cancel-expire.json'), 'utf8'));
  timeline.events[0].token = REAL;
  const result = await fetchForTimeline(timeline, {
    serviceAccountPath: saPath,
    now: new Date('2026-09-10T12:00:00Z'),
    tokenUrl: `${base}/token`,
    apiBase: base,
  });
  assert.deepEqual(result.skipped, ['tok_a1']);
  assert.equal(result.fetched.length, 1);
  assert.match(result.fetched[0].token, /^tok_[0-9a-f]{6}$/);
  assert.equal(JSON.stringify(result.timeline).includes(REAL), false, 'the input token was rewritten to its pseudonym');
});

test('diagnose --fetch diagnoses the augmented timeline and writes it without the real token', async () => {
  const input = join(FIXTURES, 'rules', 'G1-revoked-still-granting.json');
  const out = join(dir, 'augmented.json');
  const run = await runCli(['diagnose', input, '--fetch', '--service-account', saPath, '--token-map', mapPath, '--out', out, '--token-url', `${base}/token`, '--api-base', base, '--json']);
  assert.equal(run.status, 1, run.stderr);
  const parsed = JSON.parse(run.stdout);
  assert.deepEqual(parsed.fetched, [{ token: 'tok_a1', status: 200 }]);
  // The fetched EXPIRED read follows the REVOKED notification, so G1 stays; and D6 now sees EXPIRED with the ledger still granting.
  const ids = parsed.findings.map((f) => f.ruleId);
  assert.ok(ids.includes('G1'), ids.join(','));
  assert.ok(ids.includes('D6'), ids.join(','));
  const written = readFileSync(out, 'utf8');
  assert.equal(written.includes(REAL), false);
  assert.match(written, /fetched by --fetch/);

  const noKey = await runCli(['diagnose', input, '--fetch']);
  assert.equal(noKey.status, 2);
  assert.match(noKey.stderr, /--service-account/);
});
