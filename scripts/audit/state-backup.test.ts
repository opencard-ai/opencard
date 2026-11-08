import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createBackup, openBackup, restoreBackup } from './state-backup';
import { createRedisAuditState, auditStatePrefix, type EvalTransport } from './audit-state';
import { AUDIT_DOC, runWithDurableBaseline, NeedsReconciliationError, type Finding } from './durable-baseline';
import { createFakeredisBridge } from './fakeredis-bridge.mjs';

const P1 = auditStatePrefix('sandbox', 'backup-src-1'), P2 = auditStatePrefix('sandbox', 'backup-dst-1');
const f = (id: string): Finding => ({ card_id: id, type: 'broken_source_url', severity: 'high', detail: `${id} 404` });
const opts = { docName: AUDIT_DOC };
const tmp = (t: any) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-restore-')); fs.chmodSync(d, 0o700); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('real Lua: backup -> restore into fresh namespace; corrupt/foreign/stale/pending refused; cleanup', async t => {
  if (!process.env.FAKEREDIS_PYTHON) { t.skip('FAKEREDIS_PYTHON unset'); return; }
  const b = createFakeredisBridge(); t.after(() => b.close());
  const mk = (prefix: string, r: string, tr: EvalTransport = b) => createRedisAuditState({ enabled: true, prefix, transport: tr, runnerId: r });
  const key = randomBytes(32), work = tmp(t);
  await runWithDurableBaseline(mk(P1, 'a'), '2026-10-01', async () => [f('x')], opts);
  await runWithDurableBaseline(mk(P1, 'b'), '2026-10-08', async () => [f('x'), f('y')], opts);
  const now = new Date('2026-10-09T00:00:00Z');
  const env = await createBackup(mk(P1, 'bk'), key, now);
  assert.doesNotMatch(JSON.stringify(env), /broken_source_url|2026-10-08/);
  // corrupt / wrong key / foreign prefix
  const flip = { ...env, ct: Buffer.from(Buffer.from(env.ct, 'base64').map((x, i) => i === 3 ? x ^ 1 : x)).toString('base64') };
  for (const [e, k, p] of [[flip, key, P2], [env, randomBytes(32), P2], [env, key, P2]] as const) assert.throws(() => openBackup(e, k, p), /corrupt or foreign/);
  assert.equal(openBackup(env, key, P1).doc.value.date, '2026-10-08');
  // restore into SAME prefix where live doc is same version => stale, marker cleaned
  await assert.rejects(restoreBackup(mk(P1, 'r0'), env, key, { workDir: work, now }), /stale backup \(live doc is same date/);
  assert.deepEqual(fs.readdirSync(work), []);
  // too old
  await assert.rejects(restoreBackup(mk(P1, 'r1'), env, key, { workDir: work, now: new Date('2026-12-30T00:00:00Z') }), /stale backup \(age/);
  // disaster: wipe source namespace then restore (fresh, empty)
  for (const k of await b.request({ op: 'keys', pattern: `${P1}*` })) await b.request({ op: 'eval', script: "return redis.call('DEL', KEYS[1])", keys: [k], args: [] });
  const r = await restoreBackup(mk(P1, 'r2'), env, key, { workDir: work, now });
  assert.equal(r.restoredDate, '2026-10-08'); assert.deepEqual(fs.readdirSync(work), []);
  assert.equal((await runWithDurableBaseline(mk(P1, 'c'), '2026-10-08', async () => [f('x'), f('y')], opts)).kind, 'ALREADY_REPORTED');
  // ambiguous restore => marker kept; next restore refused as pending
  for (const k of await b.request({ op: 'keys', pattern: `${P1}*` })) await b.request({ op: 'eval', script: "return redis.call('DEL', KEYS[1])", keys: [k], args: [] });
  const flaky: EvalTransport = { eval: async (s, k, a) => { const v = await b.eval(s, k, a); if (s.includes('CONFLICT')) throw new Error('socket reset'); return v; } };
  await assert.rejects(restoreBackup(mk(P1, 'r3', flaky), env, key, { workDir: work, now }), NeedsReconciliationError);
  assert.deepEqual(fs.readdirSync(work), ['audit-restore.pending']);
  await assert.rejects(restoreBackup(mk(P1, 'r3b'), env, key, { workDir: work, now }), /BUSY/); // lost lease held until TTL
  await b.request({ op: 'eval', script: "return redis.call('DEL', KEYS[1])", keys: [P1 + 'lease'], args: [] }); // simulate TTL expiry
  await assert.rejects(restoreBackup(mk(P1, 'r4'), env, key, { workDir: work, now }), /pending/);
  // replay of the same (older) backup over a NEWER baseline is refused by chronology, even with lower version
  fs.rmSync(path.join(work, 'audit-restore.pending'));
  // reconciliation: the ambiguous restore had actually committed, so replaying it is refused as stale
  await assert.rejects(restoreBackup(mk(P1, 'r5'), env, key, { workDir: work, now }), /stale backup/);
  assert.deepEqual(fs.readdirSync(work), []);
  await runWithDurableBaseline(mk(P1, 'd'), '2026-10-15', async () => [f('x')], opts);
  await assert.rejects(restoreBackup(mk(P1, 'r6'), env, key, { workDir: work, now }), /stale backup/);
  // BUSY at lease acquisition leaves no marker
  const holder = mk(P1, 'h'); await holder.lease.acquire();
  await assert.rejects(restoreBackup(mk(P1, 'r7'), env, key, { workDir: work, now }), /BUSY/);
  assert.deepEqual(fs.readdirSync(work), []); await holder.lease.release();
  // authenticated but internally inconsistent snapshot (digest mismatch) is refused
  const { createCipheriv } = await import('node:crypto');
  const { digestOf } = await import('./durable-baseline');
  const seal = (snap: any) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(`opencard-audit-backup/v1|${P1}`));
    const ct = Buffer.concat([c.update(JSON.stringify(snap)), c.final()]); return { v: 1 as const, alg: 'aes-256-gcm' as const, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') }; };
  for (const findings of [[null], [{ card_id: 'x', type: 't', severity: 'urgent', detail: 'd' }], [{ card_id: '', type: 't', severity: 'high', detail: 'd' }], ['str']]) {
    const snap: any = openBackup(env, key, P1); snap.doc.value.findings = findings; snap.doc.value.digest = digestOf(findings as any);
    assert.throws(() => openBackup(seal(snap), key, P1), /corrupt/);
  }
  const mism: any = openBackup(env, key, P1); mism.doc.value.findings = [];
  assert.throws(() => openBackup(seal(mism), key, P1), /corrupt/);
  assert.equal(openBackup(seal(openBackup(env, key, P1)), key, P1).doc.value.date, '2026-10-08');
  // offer namespace untouched throughout
  assert.deepEqual(await b.request({ op: 'keys', pattern: 'opencard:offer-state:*' }), []);
  assert.throws(() => openBackup(env, Buffer.alloc(16), P1), /32 bytes/);
});
