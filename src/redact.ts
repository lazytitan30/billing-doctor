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

// A Play purchase token: a run of lowercase letters, a dot, then "AO-J1" and a
// long tail of URL-safe characters. Test tokens ("inapp:...") are not real and
// are left alone.
const TOKEN_RE = /\b[a-z]{12,40}\.AO-J1[A-Za-z0-9_-]{20,}\b/g;
// A fallback for anything token-shaped and very long: 80 or more URL-safe
// characters with no spaces. Real tokens are longer than that; nothing a
// developer writes by hand is.
const LONG_BLOB_RE = /(?<![A-Za-z0-9._-])[A-Za-z0-9._-]{80,}(?![A-Za-z0-9._-])/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Order ids: GPA. then groups of digits joined by dashes, optionally "..N".
const ORDER_RE = /\bGPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d+)?\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g;
const OAUTH_RE = /\bya29\.[A-Za-z0-9._-]{20,}/g;
const SA_FIELD_RE = /("(?:private_key_id|private_key|client_email|client_id)"\s*:\s*")[^"]*(")/g;

function short(value: string, salt: string | undefined, length: number): string {
  return createHash('sha256')
    .update(salt ? `${salt}\n${value}` : value)
    .digest('hex')
    .slice(0, length);
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
