import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
// Dynamic import: a static ESM named import of a tsx-transformed .ts (CJS) module does not
// expose named exports under Node 24, which broke the hosted offline preflight (run 42543348205).
const { runLiveAcceptance: runLive, pinAndBudget: pinReal, installBudgetFetch, localAesRoundtrip, TEST_DATABASE_ID_SHA256, TEST_ENDPOINT_SHA256, TOTAL_BUDGET } = await import('./live-sandbox-acceptance.ts');
import { createHash } from 'node:crypto';

// Synthetic fixture pins only; the real sandbox id/endpoint never appear in the repo.
const sha = (v) => createHash('sha256').update(v).digest('hex');
const URL_OK = 'https://fixture-sandbox-00000.upstash.io';
const TEST_DATABASE_ID = 'fixture-db-00000000-0000-0000-0000-000000000000';
const PINS = { databaseIdSha256: sha(TEST_DATABASE_ID), endpointSha256: sha(URL_OK) };
const pinAndBudget = (o) => pinReal({ ...o, pins: PINS });
const runLiveAcceptance = (o) => runLive({ ...o, pins: PINS });
assert.match(TEST_DATABASE_ID_SHA256, /^[0-9a-f]{64}$/);
assert.match(TEST_ENDPOINT_SHA256, /^[0-9a-f]{64}$/);

test('default pins refuse fixture values (real pins are hashes only)', () => {
  assert.throws(() => pinReal({ url: URL_OK, token: 'tok-12345678', databaseId: TEST_DATABASE_ID }), /database id/);
});

test('pin/budget guards', () => {
  assert.throws(() => pinAndBudget({ url: URL_OK, token: 'tok-12345678', databaseId: 'other' }));
  assert.throws(() => pinAndBudget({ url: 'https://evil.upstash.io', token: 'tok-12345678', databaseId: TEST_DATABASE_ID }));
  assert.throws(() => pinAndBudget({ url: URL_OK, token: 'short', databaseId: TEST_DATABASE_ID }));
  const b = pinAndBudget({ url: URL_OK, token: 'tok-12345678', databaseId: TEST_DATABASE_ID, budget: 2 });
  const f = installBudgetFetch(b, async () => new Response('{}'));
  return (async () => { await f('https://x'); await f('https://x'); await assert.rejects(f('https://x'), /budget/); assert.equal(b.used(), 2); })();
});

test('local AES roundtrip + tamper/wrong-ns', () => {
  assert.equal(localAesRoundtrip('opencard:audit-state:{sandbox-audit-fixture1}:', [{ card_id: 'syn-1', type: 'broken_source_url', severity: 'high', detail: 'synthetic-syn-1' }]), true);
});

test('config refused without live flag / bad id; construction makes zero fetches', async () => {
  let fetches = 0;
  const fetchImpl = async () => { fetches++; return new Response('no'); };
  for (const env of [
    {},
    { OPENCARD_AUDIT_LIVE: '1', OPENCARD_SANDBOX_DATABASE_ID: 'x', OPENCARD_AUDIT_SANDBOX_ID: 'audit-abcdefgh', OPENCARD_AUDIT_REDIS_URL: URL_OK, OPENCARD_AUDIT_REDIS_TOKEN: 'tok-12345678' },
    { OPENCARD_AUDIT_LIVE: '1', OPENCARD_SANDBOX_DATABASE_ID: TEST_DATABASE_ID, OPENCARD_AUDIT_SANDBOX_ID: 'offer-abcdefgh', OPENCARD_AUDIT_REDIS_URL: URL_OK, OPENCARD_AUDIT_REDIS_TOKEN: 'tok-12345678' },
    { OPENCARD_AUDIT_LIVE: '1', OPENCARD_SANDBOX_DATABASE_ID: TEST_DATABASE_ID, OPENCARD_AUDIT_SANDBOX_ID: 'audit-short', OPENCARD_AUDIT_REDIS_URL: URL_OK, OPENCARD_AUDIT_REDIS_TOKEN: 'tok-12345678' },
  ]) {
    const out = []; const code = await runLiveAcceptance({ env, fetchImpl, print: (s) => out.push(s) });
    assert.equal(code, 2); assert.equal(fetches, 0); assert.doesNotMatch(out.join('\n'), /tok-12345678|fixture-sandbox|fixture-db-/);
  }
});

test('fake Upstash REST: live path completes within budget; summary redacted', async t => {
  if (!process.env.FAKEREDIS_PYTHON) { t.skip('FAKEREDIS_PYTHON unset'); return; }
  const { createFakeredisBridge } = await import('./fakeredis-bridge.mjs');
  const { startFakeUpstash } = await import('./fake-upstash-server.mjs');
  const bridge = createFakeredisBridge(); t.after(() => bridge.close());
  const srv = await startFakeUpstash(bridge); t.after(() => srv.close());
  // Override pin for loopback by monkeypatching validate via env allowlist in transport — live harness pins production URL.
  // So: stand up a reverse: we cannot hit real pin with loopback. Instead count EVAL scripts through a custom fetch that
  // speaks Upstash protocol against fakeredis while claiming the pinned URL in env (fetch never uses the URL host for routing).
  let calls = 0;
  const realFetch = globalThis.fetch; // must NOT go through the budgeted globalThis.fetch wrapper
  const fetchImpl = async (input, init) => {
    calls++;
    return realFetch(srv.url + (new URL(input).pathname), { ...init, headers: { ...init.headers, authorization: `Bearer ${srv.token}` } });
  };
  // Bypass pin by temporarily stubbing: pin checks URL string hash before fetch. Use the real pinned URL string in env,
  // and route fetchImpl to loopback. Token must match fake server — but pin only checks URL hash + token shape.
  // Fake server expects its own token; our transport will send env token. Set env token = srv.token (shape ok).
  const env = {
    OPENCARD_AUDIT_LIVE: '1',
    OPENCARD_SANDBOX_DATABASE_ID: TEST_DATABASE_ID,
    OPENCARD_AUDIT_SANDBOX_ID: 'audit-livefix1',
    OPENCARD_AUDIT_REDIS_URL: URL_OK, // pinned string; fetchImpl ignores host
    OPENCARD_AUDIT_REDIS_TOKEN: srv.token,
  };
  const out = [];
  const code = await runLiveAcceptance({ env, fetchImpl, print: (s) => out.push(s) });
  assert.equal(code, 0, out.join('\n'));
  const summary = JSON.parse(out.join('\n'));
  assert.equal(summary.ok, true);
  assert.ok(summary.httpCalls <= TOTAL_BUDGET);
  assert.equal(summary.httpCalls, 10);
  assert.ok(summary.coverage.includes('live-baseline-created'));
  assert.ok(summary.coverage.includes('live-lease-cas-report'));
  assert.ok(summary.coverage.includes('local-aes-roundtrip'));
  assert.equal(summary.namespace, 'opencard:audit-state:{sandbox-audit-livefix1}:');
  assert.doesNotMatch(out.join('\n'), /synthetic-syn|broken_source|Bearer|tok-/);
  assert.ok(calls <= TOTAL_BUDGET);
  const keys = await bridge.request({ op: 'keys' });
  assert.ok(keys.every((k) => k.startsWith('opencard:audit-state:{sandbox-audit-livefix1}:')));
  assert.deepEqual(await bridge.request({ op: 'keys', pattern: 'opencard:offer-state:*' }), []);
});

test('workflow contract: audit job gated, secrets after offline, budget/pin present, no artifacts', () => {
  const y = fs.readFileSync(new URL('../../.github/workflows/news-isolated-dry-run.yml', import.meta.url), 'utf8');
  assert.match(y, /ops_audit_readonly:[\s\S]*?default: false/);
  const job = y.slice(y.indexOf('  ops-audit-readonly:'));
  assert.match(job, /environment: ops-audit-readonly/);
  assert.match(job, /contents: read/);
  assert.match(job, /persist-credentials: false/);
  assert.ok(!job.includes('upload-artifact'));
  assert.ok(job.indexOf('secrets.') > job.indexOf('npm ci') && job.indexOf('secrets.') > job.indexOf('Offline preflight'));
  assert.deepEqual([...new Set(job.match(/secrets\.[A-Z_]+/g))].sort(), ['secrets.OPENCARD_AUDIT_REDIS_TOKEN', 'secrets.OPENCARD_AUDIT_REDIS_URL', 'secrets.OPENCARD_SANDBOX_DATABASE_ID']);
  assert.match(job, /OPENCARD_AUDIT_LIVE: '1'/);
  assert.match(job, /node --import tsx scripts\/audit\/live-sandbox-acceptance-cli\.ts/);
  assert.doesNotMatch(y, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  assert.doesNotMatch(y, /[a-z]+-[a-z]+-\d{5,}\.upstash\.io/);
  const src = fs.readFileSync(new URL('./live-sandbox-acceptance.ts', import.meta.url), 'utf8');
  assert.match(src, /TOTAL_BUDGET = 10/);
  assert.match(src, /TEST_ENDPOINT_SHA256/);
  assert.match(src, /TEST_DATABASE_ID_SHA256/);
  assert.doesNotMatch(src, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  assert.doesNotMatch(src, /\.upstash\.io'/);
  assert.doesNotMatch(src, /allowProduction:\s*true/);
});
