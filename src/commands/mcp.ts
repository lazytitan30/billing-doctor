// `billing-doctor mcp`: serve the six tools over stdio until the client
// closes the pipe. Logging goes to stderr; stdout is the protocol.

import { parseArgs } from 'node:util';
import { startMcpServer } from '../mcp.js';

export const MCP_HELP = `Usage: billing-doctor mcp [--kit <path>]

Runs the MCP server over stdio. Tools: diagnose_timeline, explain_subscription_state,
decode_rtdn, redact_text, list_rules, get_rule. Configure it in your agent as
command "npx", args ["-y", "billing-doctor", "mcp"].
  --kit <path>   the Incident Kit folder (also BILLING_DOCTOR_KIT, or ./billing-doctor-kit)`;

export async function runMcp(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      kit: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(MCP_HELP);
    return 0;
  }
  await startMcpServer({ kit: values.kit });
  // The transport keeps the process alive; when the client closes stdin the
  // process ends and the exit code is 0.
  return 0;
}
