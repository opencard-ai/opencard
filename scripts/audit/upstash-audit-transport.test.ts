import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpstashEvalTransport, sandboxAuditStoreFromEnv, validateAuditRedisUrl, parseSandboxSpec } from './upstash-audit-transport';
import { AUDIT_DOC, runWithDurableBaseline, importBaseline, digestOf, NeedsReconciliationError, type Finding } from './durable-baseline';
import { createFakeredisBridge } from './fakeredis-bridge.mjs';
import { startFakeUpstash } from './fake-upstash-server.mjs';

const f = (id: string): Finding => ({ card_id: id, type: 'broken_source_url', severity: 'high', detail: `${id} 404` });
const opts = { docName: AUDIT_DOC };
const ID = 'sdk-test-1234';
const live = (t: any) => { if (!process.env.FAKEREDIS_PYTHON) { t.skip('FAKEREDIS_PYTHON unset'); return; } const b = createFakeredisBridge(); t.after(() => b.close()); return b; };

test('config guards: url allowlist, token, spec, production refused, no SDK retries/deserialization', () => {
  assert.equal(validateAuditRedisUrl('https://abc-12.upstash.io'), 'https://abc-12.upstash.io');
  for (const u of ['http://abc.upstash.io', 'https://abc.upstash.io/', 'https://evil.com', 'https://abc.upstash.io.evil.com', 'http://127.0.0.1:8080', undefined]) assert.throws(() => validateAuditRedisUrl(u));
  assert.equal(validateAuditRedisUrl('http://127.0.0.1:8080', { allowLoopback: true }), 'http://127.0.0.1:8080');
  assert.throws(() => createUpstashEvalTransport({ url: 'https://a.upstash.io', token: 'short' }));
  for (const s of ['sandbox-redis:short', 'sandbox-redis:UPPER1234', 'production', 'sandbox-redis:production-1234', 'fixture-file:/x']) assert.throws(() => sandboxAuditStoreFromEnv({ OPENCARD_AUDIT_DURABLE: s, OPENCARD_AUDIT_REDIS_URL: 'https://a.upstash.io', OPENCARD_AUDIT_REDIS_TOKEN: 'xxxxxxxxxx' }, 'r'));
  assert.equal(parseSandboxSpec(`sandbox-redis:${ID}`), `opencard:audit-state:{sandbox-${ID}}:`);
  let cfg: any; class Spy { constructor(c: any) { cfg = c; } async eval() { throw new Error('boom secret-ish detail'); } }
  const t = createUpstashEvalTransport({ url: 'https://a.upstash.io', token: 'tok-12345678', RedisClass: Spy as any });
  assert.equal(cfg.retry.retries, 0); assert.equal(cfg.automaticDeserialization, false); assert.equal(cfg.enableTelemetry, false); assert.equal(cfg.enableAutoPipelining, false);
  return assert.rejects(t.eval('x', [], []), (e: Error) => e.message === 'transport error');
});

test('real @upstash/redis SDK over loopback REST + real Lua: baseline recorded, report, already reported, isolation', async t => {
  const b = live(t); if (!b) return;
  const srv: any = await startFakeUpstash(b); t.after(() => srv.close());
  await b.request({ op: 'raw_set', key: 'opencard:offer-state:{production}:doc:operational', value: 'offer-untouched' });
  const env = { OPENCARD_AUDIT_DURABLE: `sandbox-redis:${ID}`, OPENCARD_AUDIT_REDIS_URL: srv.url, OPENCARD_AUDIT_REDIS_TOKEN: srv.token };
  const mk = (r: string) => sandboxAuditStoreFromEnv(env, r, { allowLoopback: true });
  assert.equal((await runWithDurableBaseline(mk('a'), '2026-10-01', async () => [f('x')], opts)).kind, 'BASELINE_CREATED');
  const r2 = await runWithDurableBaseline(mk('b'), '2026-10-08', async () => [f('x'), f('y')], opts);
  assert.equal(r2.kind, 'REPORT'); assert.deepEqual((r2 as any).fresh.map((x: Finding) => x.card_id), ['y']);
  assert.equal((await runWithDurableBaseline(mk('c'), '2026-10-08', async () => [f('x'), f('y')], opts)).kind, 'ALREADY_REPORTED');
  const keys: string[] = await b.request({ op: 'keys' });
  assert.ok(keys.filter(k => !k.startsWith('opencard:offer-state:')).every(k => k.startsWith(`opencard:audit-state:{sandbox-${ID}}:`)));
  assert.equal(await b.request({ op: 'raw_get', key: 'opencard:offer-state:{production}:doc:operational' }), 'offer-untouched');
  assert.ok(srv.calls.every((c: any) => c.method === 'POST' && c.cmd.toUpperCase() === 'EVAL'));
});

test('SDK: concurrent lease => BUSY, wrong token fails closed, ambiguous HTTP failure => reconcile, no retry', async t => {
  const b = live(t); if (!b) return;
  let mode: 'ok' | 'drop-after-cas' = 'ok';
  const srv: any = await startFakeUpstash(b, { onRequest: async (cmd: any[], res: any) => {
    if (mode === 'drop-after-cas' && String(cmd[1]).includes('CONFLICT')) {
      const n = Number(cmd[2]); await b.request({ script: cmd[1], keys: cmd.slice(3, 3 + n), args: cmd.slice(3 + n) });
      res.destroy(); return 'handled';
    }
  } });
  t.after(() => srv.close());
  const env = { OPENCARD_AUDIT_DURABLE: `sandbox-redis:${ID}`, OPENCARD_AUDIT_REDIS_URL: srv.url, OPENCARD_AUDIT_REDIS_TOKEN: srv.token };
  const holder = sandboxAuditStoreFromEnv(env, 'holder', { allowLoopback: true });
  await holder.lease.acquire();
  await assert.rejects(sandboxAuditStoreFromEnv(env, 'other', { allowLoopback: true }).lease.acquire(), /BUSY/);
  await holder.lease.release();
  await assert.rejects(sandboxAuditStoreFromEnv({ ...env, OPENCARD_AUDIT_REDIS_TOKEN: 'wrong-token-1' }, 'w', { allowLoopback: true }).lease.acquire(), /uncertain/);
  await importBaseline(sandboxAuditStoreFromEnv(env, 'imp', { allowLoopback: true }), { date: '2026-10-01', findings: [] }, digestOf([]), opts);
  mode = 'drop-after-cas';
  const before = srv.calls.length;
  await assert.rejects(runWithDurableBaseline(sandboxAuditStoreFromEnv(env, 'u', { allowLoopback: true }), '2026-10-08', async () => [f('z')], opts), NeedsReconciliationError);
  assert.equal(srv.calls.slice(before).filter((c: any) => c.cas).length, 1, 'ambiguous CAS is never retried');
  mode = 'ok';
  // Lost session keeps the lease until TTL: an immediate rerun is BUSY (fail closed, no duplicate delivery),
  // while the committed-but-unacknowledged baseline is durably present for reconciliation.
  await assert.rejects(runWithDurableBaseline(sandboxAuditStoreFromEnv(env, 'v', { allowLoopback: true }), '2026-10-08', async () => [f('z')], opts), /BUSY/);
  const doc = JSON.parse(await b.request({ op: 'raw_get', key: `opencard:audit-state:{sandbox-${ID}}:doc:${AUDIT_DOC}` }));
  assert.equal(doc.value.reportedFor, '2026-10-08'); assert.equal(doc.version, 2);
});
