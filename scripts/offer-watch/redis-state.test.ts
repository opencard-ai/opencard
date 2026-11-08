import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRedisOfferState, createUpstashOfferState, STATE_SCRIPTS } from './redis-state';
import { mockRedis } from './redis-state.fixtures';
import { createOfferPrTransport } from './pr-transport';
import { offerRunIdentity } from './run-identity';
import { previousCardValue } from './publish-core';
const PREFIX = 'opencard:offer-state:{sandbox-fixture01}:';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const session = (db: ReturnType<typeof mockRedis>, runnerId = 'runner-a') => createRedisOfferState({ enabled: true, prefix: PREFIX, transport: db.transport, ttlMs: 1000, runnerId });
test('default-off / production prefix / malformed settings fail before network', () => {
  const db = mockRedis(); assert.throws(() => createRedisOfferState({ prefix: PREFIX, transport: db.transport }));
  assert.throws(() => createRedisOfferState({ enabled: true, prefix: 'opencard:production:', transport: db.transport }));
  assert.throws(() => createUpstashOfferState({ prefix: PREFIX, url: 'https://example.upstash.io', token: 'fixture' })); assert.equal(db.calls.length, 0);
});
test('server-side atomic CAS versions: two writers at same version cannot both commit', async () => {
  const db = mockRedis(), state = session(db); await state.lease.acquire();
  const results = await Promise.allSettled([state.cas('operational', 0, { fixture: 'a' }), state.cas('operational', 0, { fixture: 'b' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal((await state.read('operational'))?.version, 1);
  assert.ok(db.calls.filter(c => c.script === STATE_SCRIPTS.cas).every(c => c.script.includes("redis.call('GET', KEYS[3])") && c.script.includes("redis.call('SET', KEYS[3]")));
  assert.ok(db.calls.every(c => c.keys.every(k => k.startsWith(PREFIX))));
});
test('lease exclusion, renewal, expiry, monotonically increasing fencing, stale writer/release denied', async () => {
  const db = mockRedis(), a = session(db), busy = session(db, 'runner-b');
  assert.equal(await a.lease.acquire(), 1); await assert.rejects(busy.lease.acquire());
  db.advance(800); await a.lease.renew(); db.advance(800); await a.lease.assert();
  db.advance(1001); const b = session(db, 'runner-b2'); assert.equal(await b.lease.acquire(), 2);
  await assert.rejects(a.cas('operational', 0, 'old fence')); await assert.rejects(a.lease.renew()); assert.equal(await a.lease.release(), false);
  await b.cas('operational', 0, 'new fence'); assert.equal((await b.read('operational'))?.fence, 2); assert.equal(await b.lease.release(), true);
  const c = session(db, 'runner-c'); assert.equal(await c.lease.acquire(), 3);
});
test('renew timeout permanently poisons session; no further writes despite unexpired server key', async () => {
  const db = mockRedis(), a = session(db); await a.lease.acquire(); db.fail('renew'); await assert.rejects(a.lease.renew());
  const count = db.calls.length; await assert.rejects(a.cas('operational', 0, 'forbidden')); await assert.rejects(a.lease.assert()); assert.equal(db.calls.length, count);
});
test('same fingerprint across runners/runs atomically claimed; safe pre-push release allows recovery', async () => {
  const db = mockRedis(), a = session(db); await a.lease.acquire(); const store = a.journal(); await store.claim(['fp-a', 'fp-b'], 'run-a');
  await assert.rejects(async () => { await store.claim(['fp-b', 'fp-c'], 'run-b'); }); assert.equal(db.get(`${PREFIX}claim:${sha('fp-c')}`), undefined);
  await store.releaseClaims!(['fp-a', 'fp-b'], 'run-a'); await store.claim(['fp-b'], 'run-b');
  await a.lease.release(); const b = session(db, 'runner-b'); await b.lease.acquire(); await assert.rejects(async () => { await b.journal().claim(['fp-b'], 'run-c'); });
});
function publication(db: ReturnType<typeof mockRedis>, state: ReturnType<typeof session>, failure?: 'cas-after-merge' | 'lease-after-push' | 'lease-before-merge' | 'rollback-before-head') {
  const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), MERGED = 'c'.repeat(40), FILE = 'data/cards/fixture.json';
  let remoteMerged = false, exists = false, checks = 0; const writes: string[] = [];
  const transport = createOfferPrTransport({ publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch', runId: 'offer-2026-11-06-morning', store: state.journal(), lease: state.lease,
    fetchDeployments: async () => [],
    run: (cmd, args) => {
      const ok = (stdout = '') => ({ code: 0, stdout }), json = (v: unknown) => ok(JSON.stringify(v));
      if (cmd === 'git') {
        if (args[0] === 'ls-remote') return ok(); if (args[0] === 'remote') return ok('https://github.com/opencard-ai/opencard.git');
        if (args[0] === 'diff') return ok(FILE); if (args[0] === 'log') return ok('opencard@opencardai.com'); if (args[0] === 'rev-parse') return ok(args[1] === 'origin/main' ? BASE : HEAD);
        if (args[0] === 'push') { writes.push('push'); if (failure === 'lease-after-push') db.advance(1001); return ok(); }
        if (args.includes('revert')) { writes.push('local-revert'); if (failure === 'rollback-before-head') return { code: 1, stdout: '' }; }
        if (args[0] === 'fetch' || args[0] === 'checkout' || args.includes('revert')) return ok();
      }
      if (cmd === 'gh') {
        if (args[0] === 'api' && args[1].includes('runner-owner')) return json({ content: Buffer.from(JSON.stringify({ version: 1, offer: { owner: 'github-actions', productionEnabled: true, epoch: 'fixture-epoch' } })).toString('base64') });
        if (args[0] === 'api') return json({ object: { sha: BASE } });
        if (args[1] === 'list') return json(args[args.indexOf('--head') + 1].includes('-rollback/') ? [] : exists ? [{ number: 1 }] : []);
        if (args[1] === 'create') { writes.push('create'); exists = true; return ok(); }
        if (args[1] === 'view') return json({ state: remoteMerged ? 'MERGED' : 'OPEN', headRefOid: HEAD, baseRefName: 'main', isDraft: false, files: [{ path: FILE }], mergeCommit: remoteMerged ? { oid: MERGED } : null });
        if (args[1] === 'checks') { checks++; if (failure === 'lease-before-merge' && checks === 2) db.advance(1001); return json(['validate', 'gitleaks'].map(name => ({ name, state: 'SUCCESS', bucket: 'pass' }))); }
        if (args[1] === 'merge') { writes.push('merge'); remoteMerged = true; if (failure === 'cas-after-merge') db.fail('cas'); return ok(); }
      }
      throw new Error(`unexpected MOCK command ${cmd}`);
    },
  });
  return { transport, writes, begin: () => transport.reconcile([FILE], ['fixture-fp']), merge: () => transport.merge(BASE, [FILE]), rollback: () => transport.rollback(MERGED, [FILE]), checks: () => checks };
}
test('actual data PR merged / state CAS response failed: next fenced runner reconciles GitHub without re-push', async () => {
  const db = mockRedis(), a = session(db); await a.lease.acquire(); const f = publication(db, a, 'cas-after-merge'); assert.equal(await f.begin(), null);
  assert.equal((await f.merge()).state, 'uncertain'); assert.deepEqual(f.writes, ['push', 'create', 'merge']);
  // Transport uncertainty invalidates lease. Renew is forbidden; wait expiry and acquire a new fenced session.
  db.advance(1001); const b = session(db, 'runner-b'); await b.lease.acquire();
  // Same GitHub truth, replacing only the state lease/store in the helper is represented by this forwarding state session.
  // The previous helper cannot write; new helper uses recorded journal and the same mocked remote.
  const journal = await b.journal().load('offer-2026-11-06-morning'); assert.equal(journal?.headSha, 'b'.repeat(40));
  const before = f.writes.length;
  const fresh = createOfferPrTransport({ publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch', runId: 'offer-2026-11-06-morning', store: b.journal(), lease: b.lease, fetchDeployments: async () => [], run: (cmd, args) => {
    if (cmd === 'gh' && args[0] === 'api') return { code: 0, stdout: JSON.stringify({ content: Buffer.from(JSON.stringify({ version: 1, offer: { owner: 'github-actions', productionEnabled: true, epoch: 'fixture-epoch' } })).toString('base64') }) };
    if (cmd === 'gh' && args[1] === 'list') return { code: 0, stdout: '[{"number":1}]' };
    if (cmd === 'gh' && args[1] === 'view') return { code: 0, stdout: JSON.stringify({ state: 'MERGED', headRefOid: 'b'.repeat(40), baseRefName: 'main', files: [{ path: 'data/cards/fixture.json' }], mergeCommit: { oid: 'c'.repeat(40) } }) };
    throw new Error('reconcile must not issue a write');
  } });
  assert.equal((await fresh.reconcile(['data/cards/fixture.json'], ['fixture-fp']))?.state, 'merged'); assert.equal(f.writes.length, before);
});
test('lost lease after push blocks PR create and merge at next external boundary', async () => { const db = mockRedis(), a = session(db); await a.lease.acquire(); const f = publication(db, a, 'lease-after-push'); await f.begin(); assert.equal((await f.merge()).state, 'uncertain'); assert.deepEqual(f.writes, ['push']); });
test('irreversible rollbackAttempted survives uncertain phase before rollbackHead; rerun queries truth, no second revert', async () => {
  const db = mockRedis(), a = session(db); await a.lease.acquire(); const f = publication(db, a, 'rollback-before-head'); await f.begin(); assert.equal((await f.merge()).state, 'merged'); assert.equal((await f.rollback()).state, 'uncertain');
  const record = await a.journal().load('offer-2026-11-06-morning'); assert.equal(record?.rollbackAttempted, true); assert.equal(record?.rollbackHead, undefined);
  assert.equal((await f.begin())?.state, 'uncertain'); assert.equal(f.writes.filter(w => w === 'local-revert').length, 1);
});
test('stable PT slot is separate from attempt and main SHA; missing nested old-value path errors explicitly', () => {
  assert.equal(offerRunIdentity('2026-11-06', 'morning', 'attempt-1').runId, offerRunIdentity('2026-11-06', 'morning', 'attempt-2').runId);
  assert.notEqual(offerRunIdentity('2026-11-06', 'morning', 'a').runId, offerRunIdentity('2026-11-06', 'evening', 'a').runId);
  assert.throws(() => previousCardValue({}, [{ field: 'welcome_offer.bonus_points', old_value: 1, new_value: 2, fingerprint: 'f' }]), /missing nested/);
});

test('newest exact production redeploy READY supersedes old ERROR; unknown timestamps do not guess', async () => {
  const store = { load: () => null, claim: () => {}, save: () => {} };
  const deployment = (created: number, readyState: string) => ({ name: 'opencard', target: 'production', meta: { githubCommitSha: 'c'.repeat(40) }, created, readyState });
  const build = (rows: ReturnType<typeof deployment>[]) => createOfferPrTransport({ publish: false, productionEnable: false, store, run: () => { throw new Error('no commands allowed'); }, fetchDeployments: async () => rows });
  assert.equal((await build([deployment(1, 'ERROR'), deployment(2, 'READY')]).deployment('c'.repeat(40))).state, 'ready');
  assert.equal((await build([deployment(2, 'ERROR'), deployment(1, 'READY')]).deployment('c'.repeat(40))).state, 'error');
  assert.equal((await build([deployment(1, 'ERROR'), deployment(1, 'READY')]).deployment('c'.repeat(40))).state, 'unknown');
});

test('prepared journal before local checks has no permanent fingerprint claim', async () => {
  const db = mockRedis(), state = session(db); await state.lease.acquire(); const f = publication(db, state); assert.equal(await f.begin(), null);
  assert.ok(!db.calls.some(c => c.script === STATE_SCRIPTS.claim)); assert.equal(db.get(`${PREFIX}claim:${sha('fixture-fp')}`), undefined);
  // A different run can claim while the first run has not passed local checks or attempted a push.
  await state.journal().claim(['fixture-fp'], 'validated-other-run'); assert.equal((await f.merge()).state, 'uncertain'); assert.deepEqual(f.writes, []);
});

test('lease expiry between fresh checks and merge prevents the GitHub merge write', async () => { const db = mockRedis(), a = session(db); await a.lease.acquire(); const f = publication(db, a, 'lease-before-merge'); await f.begin(); assert.equal((await f.merge()).state, 'uncertain'); assert.deepEqual(f.writes, ['push', 'create']); });

test('unknown journal schema refuses load before any repair write', async () => {
  const db = mockRedis(), state = session(db); await state.lease.acquire(); const runId = 'fixture-run';
  db.set(`${PREFIX}doc:journal-${sha(runId)}`, JSON.stringify({ schema: 1, version: 1, fence: 1, value: { version: 999, runId } }));
  const before = db.calls.filter(c => c.script === STATE_SCRIPTS.cas).length; await assert.rejects(async () => { await state.journal().load(runId); }); assert.equal(db.calls.filter(c => c.script === STATE_SCRIPTS.cas).length, before);
});
