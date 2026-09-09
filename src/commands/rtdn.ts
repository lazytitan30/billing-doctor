// `billing-doctor rtdn message.json`: decode a Pub/Sub push body and say what
// the next step must be. Reads a file, or stdin when the argument is `-`.

import { readFileSync } from 'node:fs';
import { decodeRtdn, describeRtdn } from '../google/rtdn.js';

export const RTDN_HELP = `Usage: billing-doctor rtdn <message.json | -> [--json]

Decodes a Pub/Sub push body (or a decoded DeveloperNotification, or the base64
data alone) and prints the notification type, the token and the next step.
  --json   print the decoded notification as JSON`;

export function runRtdn(argv: string[]): number {
  const json = argv.includes('--json');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file || argv.includes('--help') || argv.includes('-h')) {
    console.log(RTDN_HELP);
    return file ? 0 : 2;
  }
  let text: string;
  try {
    text = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`cannot read ${file}: ${(err as Error).message}`);
    return 2;
  }
  let input: unknown = text.trim();
  try {
    input = JSON.parse(text);
  } catch {
    // Not JSON: treat the text as the base64 data field.
  }
  let decoded;
  try {
    decoded = decodeRtdn(input);
  } catch (err) {
    console.error(`cannot decode: ${(err as Error).message}`);
    return 1;
  }
  if (json) {
    console.log(JSON.stringify(decoded, null, 2));
  } else {
    for (const line of describeRtdn(decoded)) console.log(line);
  }
  return 0;
}
