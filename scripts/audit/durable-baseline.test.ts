import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeBackend, createFakeAuditStore, importBaseline, runWithDurableBaseline, digestOf, assertAuditNamespace, AUDIT_KIND, NeedsReconciliationError, type Finding } from './durable-baseline';

const f = (id: string, sev: Finding['severity'] = 'high'): Finding => ({ card_id: id, type: 'broken_source_url', severity: sev, detail: `${id} 404` });
const base = [f('a')];
const seed = async (b: FakeBackend) => importBaseline(createFakeAuditStore(b, 'importer'), { date: '2026-10-02', findings: base }, digestOf(base));

test('import verifies digest, never overwrites, then baseline is read back intact', async () => {
  const b = new FakeBackend();
  await assert.rejects(importBaseline(createFakeAuditStore(b, 'i'), { date: '2026-10-02', findings: base }, 'bad'), /digest mismatch/);
  await seed(b);
  await assert.rejects(seed(b), /already present/);
  const r = await runWithDurableBaseline(createFakeAuditStore(b, 'r1'), '2026-11-08', async () => [f('a'), f('b')]);
  assert.equal(r.kind, 'REPORT'); assert.deepEqual(r.fresh.map(x => x.card_id), ['b']); assert.equal(r.previousDate, '2026-10-02');
});

test('corrupted stored baseline is refused and not overwritten', async () => {
  const b = new FakeBackend(); await seed(b);
  const raw = JSON.parse(b.docs.get('operational')!); raw.value.findings = []; b.docs.set('operational', JSON.stringify(raw));
  let ran = false;
  await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b, 'r'), '2026-11-08', async () => { ran = true; return []; }), /integrity/);
  assert.equal(ran, false); assert.equal(JSON.parse(b.docs.get('operational')!).version, 1);
});

test('two runners: second is BUSY while first holds lease, then sees ALREADY_REPORTED (no double report)', async () => {
  const b = new FakeBackend(); await seed(b);
  let release!: () => void; const gate = new Promise<void>(r => (release = r));
  const p1 = runWithDurableBaseline(createFakeAuditStore(b, 'r1'), '2026-11-08', async () => { await gate; return [f('a'), f('b')]; });
  await new Promise(r => setImmediate(r));
  await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b, 'r2'), '2026-11-08', async () => [f('b')]), /BUSY/);
  release(); assert.equal((await p1).kind, 'REPORT');
  assert.equal((await runWithDurableBaseline(createFakeAuditStore(b, 'r2'), '2026-11-08', async () => [f('c')])).kind, 'ALREADY_REPORTED');
});

test('lease expiry mid-run: old owner cannot write; new owner proceeds with higher fence', async () => {
  const b = new FakeBackend(); await seed(b);
  const r1 = runWithDurableBaseline(createFakeAuditStore(b, 'r1', 1000), '2026-11-08', async () => {
    b.now += 5000; // fake clock: lease expired
    const r2 = await runWithDurableBaseline(createFakeAuditStore(b, 'r2', 1000), '2026-11-08', async () => [f('a'), f('c')]);
    assert.equal(r2.kind, 'REPORT');
    return [f('a'), f('z')];
  });
  await assert.rejects(r1, /LEASE_LOST/);
  const doc = JSON.parse(b.docs.get('operational')!);
  assert.equal(doc.version, 2); assert.equal(doc.fence, 3); assert.deepEqual(doc.value.findings.map((x: Finding) => x.card_id), ['a', 'c']);
});

test('heartbeat renew keeps a long run alive; renew after loss stops the run', async () => {
  const b = new FakeBackend(); await seed(b);
  const ok = await runWithDurableBaseline(createFakeAuditStore(b, 'r1', 1000), '2026-11-08', async hb => { for (let i = 0; i < 5; i++) { b.now += 800; await hb(); } return base; });
  assert.equal(ok.kind, 'NO_REPLY');
  const b2 = new FakeBackend(); await seed(b2);
  await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b2, 'r1', 1000), '2026-11-08', async hb => { b2.now += 2000; await hb(); return [f('q')]; }), /LEASE_LOST/);
  assert.equal(JSON.parse(b2.docs.get('operational')!).version, 1);
});

test('CAS timeout then retry: history not overwritten, retry with stale version conflicts', async () => {
  const b = new FakeBackend(); await seed(b);
  b.failNextCas = 'before';
  await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b, 'r1'), '2026-11-08', async () => [f('a'), f('b')]), /needs reconciliation/);
  assert.equal(JSON.parse(b.docs.get('operational')!).version, 1);
  b.now += 61_000; // uncertain session never releases; lease must expire first
  const again = await runWithDurableBaseline(createFakeAuditStore(b, 'r1b'), '2026-11-08', async () => [f('a'), f('b')]);
  assert.equal(again.kind, 'REPORT');
  const s = createFakeAuditStore(b, 'stale'); await s.lease.acquire();
  await assert.rejects(s.cas('operational', 1, {}), /CONFLICT/);
});

test('empty store creates baseline without reporting; earlier date never replaces newer', async () => {
  const b = new FakeBackend();
  assert.equal((await runWithDurableBaseline(createFakeAuditStore(b, 'r'), '2026-11-08', async () => base)).kind, 'BASELINE_CREATED');
  assert.equal((await runWithDurableBaseline(createFakeAuditStore(b, 'r'), '2026-11-01', async () => [f('x')])).kind, 'ALREADY_REPORTED');
});

test('CAS committed then response lost: session dead, new session sees baseline, suppresses re-report, stale CAS rejected', async () => {
  const b = new FakeBackend(); await seed(b);
  b.failNextCas = 'after';
  const s1 = createFakeAuditStore(b, 'r1');
  await assert.rejects(runWithDurableBaseline(s1, '2026-11-08', async () => [f('a'), f('b')]), /needs reconciliation/);
  await assert.rejects(s1.cas('operational', 2, {}), /lost/);
  assert.equal(JSON.parse(b.docs.get('operational')!).version, 2);
  b.now += 61_000;
  assert.equal((await runWithDurableBaseline(createFakeAuditStore(b, 'r2'), '2026-11-08', async () => [f('x')])).kind, 'ALREADY_REPORTED');
  const s3 = createFakeAuditStore(b, 's3'); await s3.lease.acquire();
  await assert.rejects(s3.cas('operational', 1, {}), /CONFLICT/);
});

test('stored doc with invalid schema/version/fence is refused, not overwritten', async () => {
  const b = new FakeBackend();
  b.docs.set('operational', JSON.stringify({ schema: 1, version: 0, fence: 0, value: { kind: AUDIT_KIND, date: '2026-10-02', findings: [], digest: digestOf([]) } }));
  await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b, 'r'), '2026-11-08', async () => []), /corrupt state schema/);
  assert.equal(JSON.parse(b.docs.get('operational')!).version, 0);
});

test('import with invalid date is refused before writing', async () => {
  const b = new FakeBackend();
  await assert.rejects(importBaseline(createFakeAuditStore(b, 'i'), { date: 'bad', findings: base }, digestOf(base)), /integrity/);
  assert.equal(b.docs.size, 0);
});

test('REPORT is never "delivered": caller must send; CAS uncertainty is NeedsReconciliationError', async () => {
  const b = new FakeBackend(); await seed(b);
  const r = await runWithDurableBaseline(createFakeAuditStore(b, 'r'), '2026-11-08', async () => [f('a'), f('n')]);
  assert.equal(r.delivery, 'caller-must-send');
  const b2 = new FakeBackend(); await seed(b2); b2.failNextCas = 'after';
  await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b2, 'r'), '2026-11-08', async () => [f('n')]), (e: unknown) => e instanceof NeedsReconciliationError && e.needsReconciliation);
});

test('invalid calendar date / non-PT format refused before taking the lease', async () => {
  const b = new FakeBackend();
  for (const d of ['2026-02-30', '2026-11-8', '20261108']) await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b, 'r'), d, async () => []), /invalid PT date/);
  assert.equal(b.fence, 0);
});

test('offer operational doc in the namespace is refused, never overwritten', async () => {
  const b = new FakeBackend();
  b.docs.set('operational', JSON.stringify({ schema: 1, version: 3, fence: 2, value: { offerLedger: {} } }));
  await assert.rejects(runWithDurableBaseline(createFakeAuditStore(b, 'r'), '2026-11-08', async () => []), /integrity/);
  assert.equal(JSON.parse(b.docs.get('operational')!).version, 3);
});

test('audit namespace guard: audit-only sandbox id, no offer prefixes, no production', () => {
  const O = ['opencard:offer-state:{sandbox-offer-run1234}:'];
  assert.equal(assertAuditNamespace('opencard:offer-state:{sandbox-audit-weekly01}:', O), 'opencard:offer-state:{sandbox-audit-weekly01}:');
  assert.throws(() => assertAuditNamespace('opencard:offer-state:{sandbox-audit-weekly01}:', []), /offer prefixes required/);
  assert.throws(() => assertAuditNamespace('opencard:offer-state:{sandbox-offer-run1234}:', O));
  assert.throws(() => assertAuditNamespace('opencard:offer-state:production:', O));
  assert.throws(() => assertAuditNamespace('opencard:offer-state:{sandbox-audit-weekly01}:', ['opencard:offer-state:{sandbox-audit-weekly01}:']), /collides/);
});

test('import CAS committed-but-lost raises NeedsReconciliationError', async () => {
  const b = new FakeBackend(); b.failNextCas = 'after';
  await assert.rejects(importBaseline(createFakeAuditStore(b, 'i'), { date: '2026-10-02', findings: base }, digestOf(base)), (e: unknown) => e instanceof NeedsReconciliationError);
  assert.equal(JSON.parse(b.docs.get('operational')!).version, 1);
});
