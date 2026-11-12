import test from 'node:test';
import assert from 'node:assert/strict';
import { persistPublication, publishWithDurableState } from './operational-state';
import { createRedisOfferState } from './redis-state';
import { mockRedis } from './redis-state.fixtures';
import type { PublishResult, PublishConfig } from './publish-core';
const result = (): PublishResult => ({ status: 'published', commits: [{ card_id: 'fixture', sha: 'c'.repeat(40) }], reverted: [], events: [{ ts: '2026-11-06T00:00:00Z', type: 'published', card_id: 'fixture', commit: 'c'.repeat(40) }], ledger: [{ key: 'fixture-fp', card_id: 'fixture', field: 'annual_fee', value: 0, status: 'published', commit: 'c'.repeat(40) }] });
const build = (db: ReturnType<typeof mockRedis>, runnerId: string) => createRedisOfferState({ enabled: true, prefix: 'opencard:offer-state:{sandbox-operation01}:', transport: db.transport, ttlMs: 1000, runnerId });
test('durable ledger/history one CAS document; repair same receipt dedups events', async () => {
  const db = mockRedis(), state = build(db, 'first'); await state.lease.acquire();
  await persistPublication(state, result(), 'fixture-now'); await persistPublication(state, result(), 'fixture-again');
  const doc = await state.read<{ history: unknown[]; ledger: { entries: Record<string, { commit: string }> } }>('operational');
  assert.equal(doc?.value.history.length, 1); assert.equal(doc?.value.ledger.entries['fixture-fp'].commit, 'c'.repeat(40));
});
test('publication known / operational CAS response lost: never runs publisher on retry, same result repairs state', async () => {
  const db = mockRedis(), a = build(db, 'first'); await a.lease.acquire(); db.fail('cas', true); await assert.rejects(persistPublication(a, result(), 'fixture-now'));
  db.advance(1001); const b = build(db, 'second'); await b.lease.acquire(); await persistPublication(b, result(), 'fixture-repair');
  assert.equal((await b.read<{ history: unknown[] }>('operational'))?.value.history.length, 1);
});
test('optional durable publisher default disabled before all state/network commands', async () => {
  const db = mockRedis(), state = build(db, 'first');
  await assert.rejects(publishWithDurableState([], {} as PublishConfig, { run: () => { throw new Error('no command allowed'); }, fetchText: async () => { throw new Error('no network'); }, readCard: () => { throw new Error('no file reads'); }, now: () => new Date(0), sleep: async () => {}, log: () => {} }, { state, fetchDeployments: async () => [] }));
  assert.equal(db.calls.length, 0);
});

test('opt-in durable bridge runs real publisher/helper, renews at boundaries, CAS persists and same-slot resume never republishes', async () => {
  const db = mockRedis(), BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), MERGED = 'c'.repeat(40), FILE = 'data/cards/fixture.json';
  let localHead = BASE, exists = false, merged = false; const externalWrites: string[] = [];
  const run = (cmd: string, args: string[]) => {
    const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' }), json = (value: unknown) => ok(JSON.stringify(value));
    if (cmd === 'fixture-check') return ok();
    if (cmd === 'git') {
      if (args[0] === 'rev-parse') return ok(args.includes('--abbrev-ref') ? 'main' : localHead);
      if (args[0] === 'status') return ok(` M ${FILE}`);
      if (args.includes('commit')) { localHead = HEAD; return ok(); }
      if (args[0] === 'remote') return ok('https://github.com/opencard-ai/opencard.git');
      if (args[0] === 'diff') return ok(FILE); if (args[0] === 'log') return ok('opencard@opencardai.com');
      if (args[0] === 'push') { externalWrites.push('push'); return ok(); }
      if (args[0] === 'ls-remote' || args[0] === 'add') return ok();
    }
    if (cmd === 'gh') {
      if (args[0] === 'api' && args[1].includes('runner-owner')) return json({ content: Buffer.from(JSON.stringify({ version: 1, offer: { owner: 'github-actions', productionEnabled: true, epoch: 'fixture-epoch' } })).toString('base64') });
      if (args[0] === 'api') return json({ object: { sha: BASE } });
      if (args[1] === 'list') return json(exists ? [{ number: 1 }] : []);
      if (args[1] === 'view') return json({ headRefOid: HEAD, baseRefName: 'main', state: merged ? 'MERGED' : 'OPEN', isDraft: false, files: [{ path: FILE }], mergeCommit: merged ? { oid: MERGED } : null });
      if (args[1] === 'checks') return json(['validate', 'gitleaks'].map(name => ({ name, state: 'SUCCESS', bucket: 'pass' })));
      if (args[1] === 'create') { externalWrites.push('create'); exists = true; return ok(); }
      if (args[1] === 'merge') { externalWrites.push('merge'); merged = true; return ok(); }
    }
    throw new Error(`unexpected mock command: ${cmd}`);
  };
  const cfg: PublishConfig = { branch: 'main', remote: 'origin', vercelProject: 'opencard', vercelScope: 'fixture', siteBase: 'https://example.invalid', checks: [['fixture-check']], deployTimeoutMs: 10, deployPollMs: 10, liveTimeoutMs: 10, livePollMs: 10 };
  const applied = [{ card_id: 'fixture', file: FILE, sources: [], changes: [{ field: 'welcome_offer.bonus_points', old_value: 10000, new_value: 20000, fingerprint: 'fixture-fp' }] }];
  const deps = { run, readCard: () => ({ annual_fee: 0, welcome_offer: { bonus_points: 20000 } }), fetchText: async () => ({ status: 200, text: '20,000 pts No Annual Fee' }), sleep: async () => {}, now: () => new Date('2026-11-06T00:00:00Z'), log: () => {} };
  const options = (runner: string) => ({ state: build(db, runner), publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch', runId: 'offer-2026-11-06-morning', fetchDeployments: async () => [{ name: 'opencard', target: 'production', created: 1, readyState: 'READY', meta: { githubCommitSha: MERGED } }] });
  assert.equal((await publishWithDurableState(applied, cfg, deps, options('first'))).status, 'published'); assert.deepEqual(externalWrites, ['push', 'create', 'merge']);
  assert.equal((await publishWithDurableState(applied, cfg, deps, options('second'))).status, 'published'); assert.deepEqual(externalWrites, ['push', 'create', 'merge']);
  const inspection = build(db, 'inspect'); await inspection.lease.acquire(); assert.equal((await inspection.read<{ history: unknown[] }>('operational'))?.value.history.length, 1);
});
