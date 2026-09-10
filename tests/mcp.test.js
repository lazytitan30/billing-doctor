// The MCP server over stdio, driven by a small JSON-RPC client: initialize,
// list the six tools, and call each once.
// Run alone with: node --test tests/mcp.test.js (after npm run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './fixtures.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

// A minimal stdio client: newline-delimited JSON-RPC, one pending promise per id.
function startClient(args = []) {
  const child = spawn(process.execPath, [cli, 'mcp', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '';
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    }
  });
  let nextId = 1;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`no answer to ${method} in time; stderr: ${stderr}`));
        }
      }, 10_000);
    });
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  const close = () =>
    new Promise((resolve) => {
      child.on('exit', resolve);
      child.stdin.end();
      setTimeout(() => child.kill(), 2_000);
    });
  return { request, notify, close, stderr: () => stderr };
}

async function initialized(client) {
  const init = await client.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'billing-doctor-test', version: '0' },
  });
  assert.equal(init.result.serverInfo.name, 'billing-doctor');
  client.notify('notifications/initialized', {});
  return init;
}

const textOf = (response) => {
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  return response.result.content[0].text;
};

test('the server initializes, lists the six tools, and answers each', async () => {
  const client = startClient();
  try {
    const init = await initialized(client);
    assert.match(init.result.instructions, /Not affiliated with Google/);

    const list = await client.request('tools/list', {});
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['decode_rtdn', 'diagnose_timeline', 'explain_subscription_state', 'get_rule', 'list_rules', 'redact_text']);
    for (const tool of list.result.tools) assert.ok(tool.description.length > 40, `${tool.name} needs a description`);

    const timeline = JSON.parse(readFileSync(join(FIXTURES, 'rules', 'G2-void-then-active.json'), 'utf8'));
    const diagnosis = JSON.parse(textOf(await client.request('tools/call', { name: 'diagnose_timeline', arguments: { timeline } })));
    assert.equal(diagnosis.findings[0].ruleId, 'G2');
    assert.equal(diagnosis.exitCode, 1);
    assert.match(diagnosis.findings[0].googleRule.url, /^https:/);
    const asText = JSON.parse(textOf(await client.request('tools/call', { name: 'diagnose_timeline', arguments: { timeline: JSON.stringify(timeline), rules: ['B1'] } })));
    assert.deepEqual(asText.findings, []);

    const bad = await client.request('tools/call', { name: 'diagnose_timeline', arguments: { timeline: { schema: 'nope', events: [] } } });
    assert.equal(bad.result.isError, true);

    const resource = JSON.parse(readFileSync(join(FIXTURES, 'subscriptions', 'canceled-not-expired.json'), 'utf8'));
    const explained = JSON.parse(
      textOf(await client.request('tools/call', { name: 'explain_subscription_state', arguments: { resource, now: '2026-09-10T00:00:00Z', revokeOn: ['SUBSCRIPTION_STATE_CANCELED'] } })),
    );
    assert.equal(explained.accessNow, true);
    assert.equal(explained.policyDisagrees, true);

    const envelope = JSON.parse(readFileSync(join(FIXTURES, 'rtdn', 'voided-purchase.json'), 'utf8'));
    const decoded = JSON.parse(textOf(await client.request('tools/call', { name: 'decode_rtdn', arguments: { message: envelope } })));
    assert.equal(decoded.notification, 'voidedPurchase');
    assert.match(decoded.nextStep, /Revoke access/);

    const redacted = JSON.parse(textOf(await client.request('tools/call', { name: 'redact_text', arguments: { text: 'mail someone@example.com' } })));
    assert.equal(redacted.text, 'mail [email]');

    const rules = JSON.parse(textOf(await client.request('tools/call', { name: 'list_rules', arguments: {} })));
    assert.equal(rules.length, 93);

    const rule = JSON.parse(textOf(await client.request('tools/call', { name: 'get_rule', arguments: { id: 'c6' } })));
    assert.equal(rule.id, 'C6');
    assert.match(rule.googleRule.quote, /24 hours/);
    assert.equal(rule.runbook, null);

    const missing = await client.request('tools/call', { name: 'get_rule', arguments: { id: 'Z9' } });
    assert.equal(missing.result.isError, true);
  } finally {
    await client.close();
  }
});

test('the mcp command prints help and never writes to stdout except the protocol', async () => {
  const { spawnSync } = await import('node:child_process');
  const help = spawnSync(process.execPath, [cli, 'mcp', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /diagnose_timeline/);
});
