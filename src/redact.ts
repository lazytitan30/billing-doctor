// Redaction: make a log safe to paste into an issue or an assistant.
//
// Purchase tokens become stable pseudonyms (tok_ plus six hex characters of a
// hash), so the same token reads the same everywhere in the output and can
// still be followed across lines, but cannot be replayed. Emails are removed,
// order ids keep their last four characters, UUIDs become u_ pseudonyms, and
// the obvious secrets (private keys, bearer tokens, service-account fields)
// are cut out. Nothing here leaves the machine.

import { createHash } from 'node:crypto';

export interface RedactOptions {
  // Mixed into the hash so pseudonyms in one output cannot be matched against
  // another output from someone who knows the token. Optional.
  salt?: string;
}

export interface RedactResult {
  text: string;
  counts: { tokens: number; emails: number; orderIds: number; userIds: number; secrets: number };
}

// A Play purchase token. The reliable part is the ".AO-J1" marker, not the
// prefix: the original pattern demanded twelve or more lowercase characters
// before the dot and so walked straight past this project's own J3 fixture,
// reporting "redacted 0 tokens" over nine live-shaped tokens. When in doubt
// this errs towards redacting, because a false positive costs a reader one
// confusing pseudonym and a false negative publishes a bearer credential.
const TOKEN_RE = /(?<![A-Za-z0-9._-])[A-Za-z0-9_-]{1,64}\.AO-?J?1?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9._-])/g;
// A backstop for anything token-shaped and long. Sixty rather than eighty: the
// J3 fixture's tokens are seventy characters and fell through the old floor.
const LONG_BLOB_RE = /(?<![A-Za-z0-9._-])[A-Za-z0-9._-]{60,}(?![A-Za-z0-9._-])/g;
// Bounded on purpose. The unbounded form took quadratic time to fail on a
// long run of dotted labels, so a 125 kB timeline froze the process for six
// seconds and a megabyte would have taken minutes. Over the MCP server that is
// one tool call that blocks every other one. Real addresses fit comfortably.
const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}/g;
// Order ids come in two shapes. The familiar GPA. form, and the older purely
// numeric one Google still returns on some resources. Case-insensitive,
// because logs lowercase things.
const ORDER_RE = /\bGPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d+)?\b|\b\d{18,22}\.\d{10,20}\b/gi;
// With and without dashes: an obfuscated account id is often written as bare
// hex, which is thirty-two characters and under every other floor here.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/gi;
// Anchored on the BEGIN marker alone. A log that was truncated mid-key still
// has to be scrubbed, and the old pattern needed both markers to fire, so a
// cut-off key survived in full.
const PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----|$)/g;
// The HTTP scheme is case-insensitive, and logs print it however they like.
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi;
const OAUTH_RE = /\bya29\.[A-Za-z0-9._-]{20,}/gi;
// A Google API key. Not named in the promise, but it is a credential and it
// turns up in the same logs.
const API_KEY_RE = /\bAIza[A-Za-z0-9_-]{35}\b/g;
const SA_FIELD_RE = /("(?:private_key_id|private_key|client_email|client_id)"\s*:\s*")[^"]*(")/g;

function short(value: string, salt: string | undefined, length: number): string {
  return createHash('sha256')
    .update(salt ? `${salt}\n${value}` : value)
    .digest('hex')
    .slice(0, length);
}

// Every purchase-token-shaped string in a piece of text. Exported so anything
// that has to scrub tokens uses the same definition as `redact` and cannot
// drift from it, which is how --fetch came to pseudonymise one field and miss
// four others.
export function findTokens(text: string): string[] {
  return [...new Set(text.match(TOKEN_RE) ?? [])];
}

export function pseudonymForToken(token: string, salt?: string): string {
  return `tok_${short(token, salt, 6)}`;
}

export function pseudonymForUser(id: string, salt?: string): string {
  return `u_${short(id, salt, 6)}`;
}

export function maskOrderId(orderId: string): string {
  const keep = orderId.slice(-4);
  return `${orderId.slice(0, orderId.length - 4).replace(/\d/g, '*')}${keep}`;
}

export function redact(text: string, options: RedactOptions = {}): RedactResult {
  const counts = { tokens: 0, emails: 0, orderIds: 0, userIds: 0, secrets: 0 };
  let out = text;
  // Control characters first. This command exists to make a log safe to paste
  // into an issue or an assistant, and an ANSI escape is not safe to paste: it
  // can clear the screen, rewrite the window title, or on some terminals write
  // the clipboard. It can also draw text over earlier lines, which matters for
  // a tool whose contract is that every finding shows the events it rests on.
  // Tabs and newlines stay, because a log without them is unreadable.
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u009B]/g, '');

  // Secrets first, so a key inside a JSON blob is cut before anything else
  // reads the blob.
  out = out.replace(PRIVATE_KEY_RE, () => {
    counts.secrets += 1;
    return '[private key removed]';
  });
  out = out.replace(SA_FIELD_RE, (_m, open: string, close: string) => {
    counts.secrets += 1;
    return `${open}[removed]${close}`;
  });
  out = out.replace(BEARER_RE, () => {
    counts.secrets += 1;
    return 'Bearer [removed]';
  });
  out = out.replace(OAUTH_RE, () => {
    counts.secrets += 1;
    return '[oauth token removed]';
  });
  out = out.replace(API_KEY_RE, () => {
    counts.secrets += 1;
    return '[api key removed]';
  });

  out = out.replace(TOKEN_RE, (token) => {
    counts.tokens += 1;
    return pseudonymForToken(token, options.salt);
  });
  out = out.replace(LONG_BLOB_RE, (blob) => {
    counts.tokens += 1;
    return pseudonymForToken(blob, options.salt);
  });
  out = out.replace(EMAIL_RE, () => {
    counts.emails += 1;
    return '[email]';
  });
  out = out.replace(ORDER_RE, (orderId) => {
    counts.orderIds += 1;
    return maskOrderId(orderId);
  });
  out = out.replace(UUID_RE, (id) => {
    counts.userIds += 1;
    return pseudonymForUser(id, options.salt);
  });

  return { text: out, counts };
}

export function describeCounts(counts: RedactResult['counts']): string {
  const parts = [
    `${counts.tokens} token${counts.tokens === 1 ? '' : 's'}`,
    `${counts.emails} email${counts.emails === 1 ? '' : 's'}`,
    `${counts.orderIds} order id${counts.orderIds === 1 ? '' : 's'}`,
    `${counts.userIds} user id${counts.userIds === 1 ? '' : 's'}`,
    `${counts.secrets} secret${counts.secrets === 1 ? '' : 's'}`,
  ];
  return `redacted ${parts.join(', ')}`;
}
