// Throw malformed input at everything that reads from outside.
//
//   node scripts/fuzz.mjs [seed] [iterations]
//
// This tool is pointed at logs. Logs are truncated, double-encoded, written by
// three different libraries and occasionally corrupted. So every entry point
// here takes input nobody designed:
//
//   parseTimeline   arbitrary JSON from a file somebody assembled by hand
//   decodeRtdn      a base64 blob out of a Pub/Sub push body
//   redact          raw log text, pasted, of any size
//
// A crash on malformed input is a real bug, not a cosmetic one. An unhandled
// exception loses the user's work; a regular expression that backtracks
// catastrophically hangs the process while somebody waits. Both are the kind of
// thing only random input finds, because nobody writes a test for the case they
// did not imagine.
//
// Deterministic: the seed is printed, and replaying it reproduces a failure
// exactly.

import { readFileSync } from 'node:fs';

const seed = Number(process.argv[2] ?? Date.now() % 100000);
const iterations = Number(process.argv[3] ?? 3000);

// A small deterministic generator, so a failing run can be replayed.
let state = seed >>> 0 || 1;
function rand() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return ((state >>> 0) % 100000) / 100000;
}
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (n) => Math.floor(rand() * n);

// Values chosen to break assumptions rather than to look like data.
const NASTY = [
  '', ' ', '\u0000', '\n', '\r\n', '\\', '"', "'", '{}', '[]', 'null', 'undefined', 'NaN',
  '0', '-0', '1e309', '-1e309', '9007199254740993', '0.1', '-1', 'true', 'false',
  '../../etc/passwd', '<script>', '${}', '%s', '\uD800', '\uDFFF', '\uFFFD',
  'tok_', 'GPA.', 'ya29.', 'Bearer ', '-----BEGIN PRIVATE KEY-----',
  'a'.repeat(1000), '\u0000'.repeat(100), '{'.repeat(200), '['.repeat(200),
  '2026-13-45T99:99:99Z', '0000-00-00', 'Infinity',
];
const KINDS = ['app', 'api', 'ledger', 'rtdn', 'support', 'console', 'unknown', '', null, 123];

function nastyValue(depth = 0) {
  const r = rand();
  if (depth > 3) return pick(NASTY);
  if (r < 0.3) return pick(NASTY);
  if (r < 0.4) return int(1e9) - 5e8;
  if (r < 0.5) return rand() < 0.5;
  if (r < 0.55) return null;
  if (r < 0.7) return Array.from({ length: int(4) }, () => nastyValue(depth + 1));
  const o = {};
  for (let i = 0; i < int(5); i += 1) o[pick(['t', 'kind', 'token', 'status', 'call', 'op', 'type', 'i', '__proto__', 'constructor'])] = nastyValue(depth + 1);
  return o;
}

function nastyTimeline() {
  const r = rand();
  if (r < 0.1) return pick(NASTY);
  const tl = {
    schema: rand() < 0.8 ? 'billing-doctor-timeline/1' : pick(NASTY),
    events: Array.from({ length: int(6) }, () => {
      const e = { kind: pick(KINDS), t: rand() < 0.6 ? '2026-01-01T00:00:00Z' : pick(NASTY) };
      for (let i = 0; i < int(4); i += 1) e[pick(['token', 'status', 'call', 'op', 'type', 'productId', 'purchaseState', 'quantity', 'responseCode', 'lineItems', 'messageId', 'notificationType'])] = nastyValue();
      return e;
    }),
  };
  if (rand() < 0.4) tl.app = nastyValue();
  if (rand() < 0.4) tl.policy = nastyValue();
  if (rand() < 0.4) tl.config = nastyValue();
  return tl;
}

const T = new URL('../dist/', import.meta.url);
const { parseTimeline, normalizeTimeline } = await import(new URL('engine/timeline.js', T));
const { diagnose } = await import(new URL('engine/diagnose.js', T));
const { redact } = await import(new URL('redact.js', T));
const { decodeRtdn } = await import(new URL('google/rtdn.js', T)).catch(() => ({ decodeRtdn: null }));

const failures = [];
// Anything slower than this on one small input is a backtracking regular
// expression, which is a hang in front of a waiting person.
const SLOW_MS = 2000;

// A function that rejects bad input with a clear Error is behaving. A function
// that trips over its own assumptions throws one of these instead, and that is
// the bug worth finding: the user sees a stack trace and loses their work.
const CRASH = new Set(['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'AggregateError']);

function attempt(label, input, fn) {
  const started = Date.now();
  try {
    fn();
  } catch (err) {
    const kind = err?.constructor?.name ?? 'unknown';
    const deliberate = kind === 'Error' && typeof err?.message === 'string' && err.message.length > 0;
    if (!deliberate || CRASH.has(kind)) {
      failures.push({ label, input: JSON.stringify(input).slice(0, 300), error: `${kind}: ${err?.message}`.slice(0, 200) });
    }
    return;
  }
  const took = Date.now() - started;
  if (took > SLOW_MS) failures.push({ label, input: JSON.stringify(input).slice(0, 300), error: `took ${took}ms, which is a hang` });
}

console.log(`\nfuzzing with seed ${seed}, ${iterations} iterations per target\n`);

for (let n = 0; n < iterations; n += 1) {
  // 1. A timeline file somebody assembled by hand.
  const tl = nastyTimeline();
  attempt('parseTimeline', tl, () => {
    const parsed = parseTimeline(typeof tl === 'string' ? tl : JSON.stringify(tl));
    // A valid parse must survive normalisation and every rule, because that is
    // what the command does next.
    if (parsed.ok) diagnose(normalizeTimeline(parsed.timeline));
  });

  // 2. Raw text pasted into redact. Size matters here: a catastrophic regular
  // expression only shows itself on a long input.
  const text = rand() < 0.3
    ? pick(NASTY).repeat(1 + int(50))
    : Array.from({ length: 1 + int(20) }, () => pick(NASTY)).join(rand() < 0.5 ? ' ' : '');
  attempt('redact', text.slice(0, 200), () => redact(text));

  // 3. A Pub/Sub push body.
  if (decodeRtdn) {
    const body = rand() < 0.5
      ? { message: { data: Buffer.from(JSON.stringify(nastyValue())).toString('base64'), messageId: pick(NASTY) } }
      : nastyValue();
    attempt('decodeRtdn', body, () => decodeRtdn(typeof body === 'string' ? body : JSON.stringify(body)));
  }
}

if (failures.length) {
  const unique = new Map();
  for (const f of failures) if (!unique.has(f.label + f.error)) unique.set(f.label + f.error, f);
  console.log(`${failures.length} failure(s), ${unique.size} distinct:\n`);
  for (const f of [...unique.values()].slice(0, 12)) {
    console.log(`  ${f.label}: ${f.error}`);
    console.log(`    input: ${f.input}\n`);
  }
  console.log(`Replay with: node scripts/fuzz.mjs ${seed} ${iterations}\n`);
  process.exit(1);
}
console.log(`No crashes and nothing slower than ${SLOW_MS}ms. Replay with seed ${seed}.\n`);
