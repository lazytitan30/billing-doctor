// The MCP server over stdio: the same engine as the CLI, exposed as six tools
// so a coding agent can call it while the developer fixes the bug. Nothing
// here opens a network connection; stdio is the only transport.

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { VERSION } from './index.js';
import { parseTimeline, validateTimeline } from './engine/timeline.js';
import { diagnose } from './engine/diagnose.js';
import { RULES, GROUPS, ruleById } from './engine/catalogue.js';
import { googleRule } from './google/docs.js';
import { decodeRtdn } from './google/rtdn.js';
import { explainSubscription, type SubscriptionResource } from './google/states.js';
import { redact } from './redact.js';
import { findKit, runbookEntry } from './kit.js';

const INSTRUCTIONS = `Billing Doctor diagnoses Google Play Billing incidents from a redacted timeline. It runs locally and calls nothing. Not affiliated with Google.
Build a timeline (schema billing-doctor-timeline/1: app, api, ledger, rtdn, support and console events, tokens as tok_ pseudonyms) and call diagnose_timeline. Every finding carries evidence (event indexes), Google's rule with a dated link, a confidence and a next check. Use redact_text on logs before putting anything in a timeline; use decode_rtdn on a Pub/Sub push body; use explain_subscription_state on a purchases.subscriptionsv2 resource; use list_rules and get_rule for the catalogue.`;

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function failure(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

// Accepts the timeline as an object or as JSON text.
function parseInput(input: unknown) {
  return typeof input === 'string' ? parseTimeline(input) : validateTimeline(input);
}

export function createMcpServer(options: { kit?: string } = {}): McpServer {
  const server = new McpServer({ name: 'billing-doctor', version: VERSION }, { instructions: INSTRUCTIONS });
  const kitDir = findKit(options.kit);

  server.registerTool(
    'diagnose_timeline',
    {
      title: 'Diagnose a purchase timeline',
      description:
        'Run every rule over a billing-doctor-timeline/1 document and return the findings, sorted by severity then first evidence index. Each finding has ruleId, severity, title, evidence (event indexes), mechanism, googleRule {quote, url, readOn}, confidence, nextCheck and fix. exitCode is 1 when a high finding exists.',
      inputSchema: z.object({
        timeline: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('The timeline as an object or as JSON text'),
        rules: z.array(z.string()).optional().describe('Run only these rule ids'),
      }),
    },
    async ({ timeline, rules }) => {
      const parsed = parseInput(timeline);
      if (!parsed.ok) return failure(`not a valid timeline:\n${parsed.errors.join('\n')}`);
      const result = diagnose(parsed.timeline!, { rules });
      // A ceiling on what goes back to the model. findings are already sorted
      // worst first, so truncating keeps what matters and says that it did.
      // Without this a large timeline returned nine times its own size and
      // filled the caller's context with the same rule repeated.
      const MAX_FINDINGS = 50;
      const shown = result.findings.slice(0, MAX_FINDINGS);
      const withRunbook = shown.map((f) => ({ ...f, runbook: runbookEntry(kitDir, f.ruleId) ?? null }));
      return text({
        summary: result.summary,
        exitCode: result.exitCode,
        warnings: parsed.warnings,
        findings: withRunbook,
        ...(result.findings.length > shown.length
          ? {
              truncated: {
                shown: shown.length,
                total: result.findings.length,
                note: `Only the ${shown.length} most severe are listed. Run billing-doctor diagnose on the file for all ${result.findings.length}.`,
              },
            }
          : {}),
        errors: result.errors,
      });
    },
  );

  server.registerTool(
    'explain_subscription_state',
    {
      title: 'Explain a subscription resource',
      description:
        'Explain a purchases.subscriptionsv2 resource in plain words: the state, the access it implies under Google\'s rule and under the given policy, the expiry per line item, the acknowledgement deadline, the linked token, the test marker, the plan type and the cancellation context.',
      inputSchema: z.object({
        resource: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('The SubscriptionPurchaseV2 as an object or JSON text'),
        grantOn: z.array(z.string()).optional().describe('States the backend grants access on'),
        revokeOn: z.array(z.string()).optional().describe('States the backend revokes on'),
        now: z.string().optional().describe('ISO time to evaluate deadlines at; default now'),
      }),
    },
    async ({ resource, grantOn, revokeOn, now }) => {
      let value: SubscriptionResource;
      try {
        value = typeof resource === 'string' ? (JSON.parse(resource) as SubscriptionResource) : (resource as SubscriptionResource);
      } catch (err) {
        return failure(`resource is not JSON: ${(err as Error).message}`);
      }
      const at = now ? new Date(now) : undefined;
      if (at && Number.isNaN(at.getTime())) return failure(`now is not a time: ${now}`);
      return text(explainSubscription(value, { grantOn, revokeOn, now: at }));
    },
  );

  server.registerTool(
    'decode_rtdn',
    {
      title: 'Decode a real-time developer notification',
      description:
        'Decode a Pub/Sub push body (or a decoded DeveloperNotification, or the base64 data alone): the notification kind, the type name for the integer, the token, and the next step, which for a subscription notification is always to re-fetch the resource before touching state.',
      inputSchema: z.object({
        message: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('The push envelope, the notification object, or the base64 data'),
      }),
    },
    async ({ message }) => {
      let input: unknown = message;
      if (typeof message === 'string') {
        try {
          input = JSON.parse(message);
        } catch {
          input = message.trim();
        }
      }
      try {
        return text(decodeRtdn(input));
      } catch (err) {
        return failure(`cannot decode: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    'redact_text',
    {
      title: 'Redact a log',
      description:
        'Replace purchase tokens with stable tok_ pseudonyms, remove emails, mask order ids to their last four characters, turn UUIDs into u_ pseudonyms and cut out private keys and bearer tokens. Run it over logs before building a timeline.',
      inputSchema: z.object({
        text: z.string().describe('The text to redact'),
        salt: z.string().optional().describe('Mixed into the pseudonyms'),
      }),
    },
    async ({ text: input, salt }) => text(redact(input, { salt })),
  );

  server.registerTool(
    'list_rules',
    {
      title: 'List the rule catalogue',
      description: 'Every rule: id, group, severity, title and what it detects.',
      inputSchema: z.object({}),
    },
    async () =>
      text(RULES.map((r) => ({ id: r.id, group: r.group, groupName: GROUPS[r.group], severity: r.severity, title: r.title, detects: r.detects }))),
  );

  server.registerTool(
    'get_rule',
    {
      title: 'Get one rule',
      description:
        'One rule in full: what it detects, Google\'s rule quoted with the URL and the date it was read, the observed behaviour when there is one, and the runbook entry when the Incident Kit folder is present.',
      inputSchema: z.object({ id: z.string().describe('The rule id, for example B1') }),
    },
    async ({ id }) => {
      const rule = ruleById(id);
      if (!rule) return failure(`no rule ${id}; list_rules lists them`);
      return text({
        id: rule.id,
        group: rule.group,
        groupName: GROUPS[rule.group],
        severity: rule.severity,
        title: rule.title,
        detects: rule.detects,
        googleRule: googleRule(rule.id),
        runbook: runbookEntry(kitDir, rule.id) ?? null,
        // Whether a kit is present, not where it lives. The path carries the
        // user's username and the caller may be a remote model.
        kit: kitDir ? 'present' : null,
      });
    },
  );

  return server;
}

export async function startMcpServer(options: { kit?: string } = {}): Promise<void> {
  const server = createMcpServer(options);
  await server.connect(new StdioServerTransport());
}
