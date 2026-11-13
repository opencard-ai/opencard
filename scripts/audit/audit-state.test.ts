import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedisAuditState, auditStatePrefix, assertAuditStatePrefix, type EvalTransport } from './audit-state';
import { AUDIT_DOC, importBaseline, runWithDurableBaseline, digestOf, NeedsReconciliationError, type Finding } from './durable-baseline';
import { createFakeredisBridge } from './fakeredis-bridge.mjs';

const prefix = auditStatePrefix('sandbox', 'test-12345678');
const options = { docName: AUDIT_DOC };
const finding = (id: string): Finding => ({ card_id: id, type: 'broken_source_url', severity: 'high', detail: `${id} 404` });
const make = (transport: EvalTransport, runnerId = 'runner') => createRedisAuditState({ enabled: true, prefix, transport, runnerId });
const fixture = (t: { skip(reason: string): void; after(fn: () => void): void }) => {
  if (!process.env.FAKEREDIS_PYTHON) { t.skip('FAKEREDIS_PYTHON unset; requires fakeredis[lua]'); return; }
  const bridge = createFakeredisBridge(); t.after(() => bridge.close()); return bridge;
};

test('prefix and configuration guards', () => {
  assert.equal(assertAuditStatePrefix(prefix), prefix);
  const production = auditStatePrefix('production');
  assert.throws(() => assertAuditStatePrefix(production), /allowProduction/);
  assert.equal(assertAuditStatePrefix(production, { allowProduction: true }), production);
  for (const p of ['opencard:offer-state:{sandbox-test12345}:', prefix + 'escape', 'opencard:audit-state:{sandbox-short}:', 'opencard:audit-state:{sandbox-UPPER123}:', auditStatePrefix('sandbox', 'x'.repeat(64)) + ':']) assert.throws(() => assertAuditStatePrefix(p));
  assert.throws(() => auditStatePrefix('sandbox', 'x'.repeat(65)));
  const transport = { eval: async () => ['OK', '1'] };
  const config = { enabled: true, prefix, transport, runnerId: 'r' };
  for (const patch of [{ enabled: false }, { ttlMs: 999 }, { ttlMs: 300001 }, { runnerId: 'a:b' }, { runnerId: '' }]) assert.throws(() => createRedisAuditState({ ...config, ...patch }));
});

test('transport errors and non-string-array replies permanently lose session', async () => {
  for (const evalFn of [async () => { throw new Error('offline'); }, async () => null, async () => [1], async () => []]) {
    const s = make({ eval: evalFn });
    await assert.rejects(s.lease.acquire(), /state transport uncertain/);
    await assert.rejects(s.lease.acquire(), /new lease session/);
    assert.equal(await s.lease.release(), false);
  }
});

test('real Lua: import, REPORT, ALREADY_REPORTED, NO_REPLY, lease guard, CAS and namespace isolation', async t => {
  const b = fixture(t); if (!b) return;
  await b.request({ op: 'raw_set', key: 'opencard:offer-state:{production}:doc:operational', value: 'untouched' });
  await importBaseline(make(b), { date: '2026-10-01', findings: [] }, digestOf([]), options);
  await assert.rejects(importBaseline(make(b), { date: '2026-10-01', findings: [] }, digestOf([]), options), /already present/);
  assert.equal((await runWithDurableBaseline(make(b), '2026-11-08', async hb => { await hb(); return [finding('a')]; }, options)).kind, 'REPORT');
  assert.equal((await runWithDurableBaseline(make(b), '2026-11-08', async () => { throw new Error('must not run'); }, options)).kind, 'ALREADY_REPORTED');
  assert.equal((await runWithDurableBaseline(make(b), '2026-11-09', async () => [finding('a')], options)).kind, 'NO_REPLY');
  const s = make(b); await s.lease.acquire();
  assert.ok(s.lease.fencing()! >= 1);
  await assert.rejects(make(b, 'second').lease.acquire(), /BUSY/);
  await assert.rejects(s.read('../escape'), /doc name/);
  await assert.rejects(s.cas(AUDIT_DOC, 0, {}), /CONFLICT/);
  await b.request({ op: 'raw_set', key: prefix + 'fence', value: '100' });
  await assert.rejects(s.lease.renew(), /LEASE_LOST/);
  assert.equal(await s.lease.release(), false);
  assert.equal(await b.request({ op: 'raw_get', key: 'opencard:offer-state:{production}:doc:operational' }), 'untouched');
  assert.deepEqual(await b.request({ op: 'keys', pattern: prefix + '*' }), [prefix + 'doc:audit-baseline', prefix + 'fence', prefix + 'lease'].sort());
});

test('real Lua: lost lease prevents orchestration write; corrupt schema/version/fence refused', async t => {
  const b = fixture(t); if (!b) return;
  await assert.rejects(runWithDurableBaseline(make(b), '2026-11-08', async () => {
    await b.request({ op: 'raw_set', key: prefix + 'lease', value: 'other:1' }); return [];
  }, options), /LEASE_LOST/);
  assert.equal(await b.request({ op: 'raw_get', key: prefix + 'doc:audit-baseline' }), null);
  await b.request({ op: 'raw_set', key: prefix + 'lease', value: 'invalid' });
  // Remove the competing lease through Redis itself.
  await b.eval("redis.call('DEL', KEYS[1]); return {'OK'}", [prefix + 'lease'], []);
  const s = make(b); await s.lease.acquire();
  for (const patch of [{ schema: 2 }, { version: 0 }, { fence: 0 }]) {
    await b.request({ op: 'raw_set', key: prefix + 'doc:audit-baseline', value: JSON.stringify({ schema: 1, version: 1, fence: 1, ...patch, value: {} }) });
    await assert.rejects(s.read(AUDIT_DOC), /corrupt state schema/);
  }
  await b.request({ op: 'raw_set', key: prefix + 'doc:audit-baseline', value: '{"schema":2}' });
  await assert.rejects(s.cas(AUDIT_DOC, 0, {}), /SCHEMA/);
  await s.lease.release();
});

test('real Lua: committed CAS with lost response requires reconciliation, suppresses retry report', async t => {
  const b = fixture(t); if (!b) return;
  const uncertain: EvalTransport = { async eval(script, keys, args) {
    const reply = await b.eval(script, keys, args);
    if (keys.length === 3 && args.length === 4) throw new Error('response lost');
    return reply;
  } };
  await assert.rejects(runWithDurableBaseline(make(uncertain), '2026-11-08', async () => [], options), NeedsReconciliationError);
  await b.eval("redis.call('DEL', KEYS[1]); return {'OK'}", [prefix + 'lease'], []);
  assert.equal((await runWithDurableBaseline(make(b), '2026-11-08', async () => [], options)).kind, 'ALREADY_REPORTED');
});

test('bridge rejects every pending call promptly when child dies mid-call', async t => {
  const b = fixture(t); if (!b) return;
  await b.request({ op: 'keys' }); // Python ready before stopping it.
  b.child.kill('SIGSTOP');
  const start = Date.now();
  const p = b.request({ op: 'keys' }), p2 = b.request({ op: 'raw_get', key: 'x' });
  const rejected = Promise.all([assert.rejects(p, /exited/), assert.rejects(p2, /exited/)]);
  b.child.kill('SIGKILL');
  await rejected;
  assert.ok(Date.now() - start < 5000);
});

test('bridge times out a stalled Python within 5s and invalidates pending calls', async t => {
  const b = fixture(t); if (!b) return;
  await b.request({ op: 'keys' });
  b.child.kill('SIGSTOP');
  const start = Date.now();
  await assert.rejects(b.request({ op: 'keys' }), /timeout \(5s\)/);
  assert.ok(Date.now() - start < 6000);
  await assert.rejects(b.request({ op: 'keys' }), /timeout/);
});

test('real Lua: expired owner cannot write after a successor acquires a higher fence', async t => {
  const b = fixture(t); if (!b) return;
  const a = make(b, 'a');
  await a.lease.acquire();
  await b.eval("redis.call('PEXPIRE', KEYS[1], 1); return {'OK'}", [prefix + 'lease'], []);
  await new Promise(r => setTimeout(r, 20));
  const successor = make(b, 'b');
  assert.equal(await successor.lease.acquire(), 2);
  await assert.rejects(a.cas(AUDIT_DOC, 0, {}), /LEASE_LOST/);
  assert.equal(await a.lease.release(), false);
  assert.equal((await successor.cas(AUDIT_DOC, 0, {})).fence, 2);
  await successor.lease.release();
});
