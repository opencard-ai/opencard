import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gitBlobId } from './publication-binding';
import { runSandboxDaily } from './daily';
import { redisSandboxState, fileFixtureState, type OfferStateIO } from './sandbox-state';
import { createRedisOfferState, STATE_SCRIPTS } from './redis-state';
import { mockRedis } from './redis-state.fixtures';
import { emptyLedger, type CardRecord } from './gate';
const PREFIX = 'opencard:offer-state:{sandbox-dailyrun01}:', FILE = 'data/cards/fixture-card.json', BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), MERGE = 'c'.repeat(40);
const NOW = Date.parse('2026-11-06T20:00:00Z');
function harness() {
  const db = mockRedis(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-daily-private-'));
  const cards = new Map<string, CardRecord>([['fixture-card', { card_id: 'fixture-card', name: 'Synthetic Card', annual_fee: 0, welcome_offer: { bonus_points: 10000, spending_requirement: 1000, time_period_months: 3, point_program: 'Fixture Points', description: 'Synthetic baseline', is_elevated: false }, sources: [] }]]);
  const seed = { schema: 1 as const, ledger: emptyLedger(), history: [], daily: {} };
  const writes: string[] = [], pushRefs: string[] = []; const committedBlobs: Record<string, string> = {};
  let localHead = BASE, exists = false, merged = false, fetches = 0, owner = true;
  const makeIo = (runner: string, file = false) => {
    const scratch = path.join(root, `scratch-${runner}`);
    if (file) {
      const fixture = path.join(root, 'legacy-fixture'); fs.mkdirSync(fixture, { mode: 0o700 });
      fs.writeFileSync(path.join(fixture, 'offer-state.sandbox.json'), JSON.stringify({ schema: 1, sandbox: true, fixtureId: 'daily-fixture' }));
      fs.writeFileSync(path.join(fixture, 'ledger.json'), JSON.stringify(seed.ledger)); fs.writeFileSync(path.join(fixture, 'history.jsonl'), ''); fs.writeFileSync(path.join(fixture, 'daily-state.json'), '{}');
      return fileFixtureState({ root: fixture, scratch, artifacts: path.join(root, `artifacts-${runner}`), cards });
    }
    const state = createRedisOfferState({ enabled: true, prefix: PREFIX, transport: db.transport, runnerId: runner, ttlMs: 1000 });
    return redisSandboxState({ enabled: true, state, scratch, artifacts: path.join(root, `artifacts-${runner}`), cards, seed });
  };
  const run = (cmd: string, args: string[]) => {
    const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' }), json = (v: unknown) => ok(JSON.stringify(v));
    if (cmd === 'git') {
      if (args[0] === 'rev-parse') return ok(args.includes('--abbrev-ref') ? 'main' : localHead);
      if (args[0] === 'status') return ok(` M ${FILE}`);
      if (args.includes('commit')) { localHead = HEAD; return ok(); }
      if (args[0] === 'remote') return ok('https://github.com/opencard-ai/opencard.git');
      if (args[0] === 'diff') return ok(args.includes('-z') ? `${FILE}\0` : FILE); if (args[0] === 'log') return ok('opencard@opencardai.com');
      if (args[0] === 'push') { writes.push('push'); pushRefs.push(args.at(-1)!); return ok(); }
      if (args[0] === 'ls-tree') return ok(`100644 blob ${'d'.repeat(40)}\t${FILE}\0`);
      if (args[0] === 'ls-remote' || args[0] === 'ls-files' || args[0] === 'add') return ok();
      if (args.includes('revert')) { writes.push('revert'); throw new Error('unexpected rollback in fixture'); }
    }
    if (cmd === 'gh') {
      if (args[0] === 'api' && args[1].includes('runner-owner')) return json({ content: Buffer.from(JSON.stringify({ version: 1, offer: { owner: owner ? 'github-actions' : 'mac', productionEnabled: true, epoch: 'fixture-epoch' } })).toString('base64') });
      if (args[0] === 'api') return json({ object: { sha: BASE } });
      if (args[1] === 'list') return json(exists ? [{ number: 1 }] : []);
      if (args[1] === 'view') return json({ headRefOid: HEAD, baseRefName: 'main', isDraft: false, state: merged ? 'MERGED' : 'OPEN', files: [{ path: FILE }], mergeCommit: merged ? { oid: MERGE } : null });
      if (args[1] === 'checks') return json(['validate', 'gitleaks'].map(name => ({ name, state: 'SUCCESS', bucket: 'pass' })));
      if (args[1] === 'create') { exists = true; writes.push('create'); return ok(); }
      if (args[1] === 'merge') { merged = true; writes.push('merge'); return ok(); }
    }
    throw new Error(`unhandled MOCK ${cmd}`);
  };
  const options = (io: OfferStateIO, attemptId = 'attempt-1'): Parameters<typeof runSandboxDaily>[0] => ({
    enabled: true, io, today: '2026-11-06', slot: 'morning', attemptId, now: NOW, heartbeatMs: 2, registry: new Set(), officialDomains: ['americanexpress.com'],
    entries: [{ card_id: 'fixture-card', sources: [{ url: 'https://www.americanexpress.com/fixture', patterns: [] }] }],
    fetch: async (source, attempt) => { fetches++; return { url: source.url, fetch_id: `fixture-fetch-${attempt}`, checked_at: new Date(NOW).toISOString(), ok: true, official_domain: true, values: { 'welcome_offer.bonus_points': 20000 } }; },
    validate: async signal => !signal.aborted,
    asyncRun: async (_cmd, _args, signal, context) => ({ code: signal.aborted ? 1 : 0, cwd: context.cwd }),
    publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch',
    config: { branch: 'main', remote: 'origin', vercelProject: 'opencard', vercelScope: 'fixture', siteBase: 'https://example.invalid', checks: [['fixture-check', 'validate'], ['fixture-check', 'build']], deployTimeoutMs: 10, deployPollMs: 10, liveTimeoutMs: 10, livePollMs: 10 },
    publisher: { run: (cmd, args) => {
      if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { code: 0, stdout: io.publicationRoot, stderr: '' };
      if (cmd === 'git' && args[0] === 'hash-object') return { code: 0, stdout: gitBlobId(io.cardBytes(args.at(-1)!)), stderr: '' };
      if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--verify') { const ref = args[2]; return { code: 0, stdout: ref.startsWith(':') ? gitBlobId(io.cardBytes(ref.slice(1))) : committedBlobs[ref.slice(ref.indexOf(':') + 1)] ?? '', stderr: '' }; }
      if (cmd === 'git' && args.includes('commit')) committedBlobs[FILE] = gitBlobId(io.cardBytes(FILE));
      if (cmd === 'gh' && args[0] === 'api' && args[1].includes('/git/trees/')) return { code: 0, stdout: JSON.stringify({ truncated: false, tree: Object.entries(committedBlobs).map(([path, sha]) => ({ path, sha, mode: '100644', type: 'blob' })) }), stderr: '' };
      return run(cmd, args);
    }, fetchText: async () => ({ status: 200, text: '20,000 pts Spend $1,000 within 3 months $0 Annual Fee' }), sleep: async () => {}, now: () => new Date(NOW), log: () => {} },
    fetchDeployments: async () => [{ created: 1, name: 'opencard', target: 'production', readyState: 'READY', meta: { githubCommitSha: MERGE } }],
  });
  return { db, root, cards, seed, writes, pushRefs, makeIo, options, fetches: () => fetches, revokeOwner: () => { owner = false; }, close: () => fs.rmSync(root, { recursive: true }) };
}
test('actual daily → collect/review/apply/state → publisher → digest, Redis authoritative; same slot/fresh scratch resumes without re-fetch/write', async () => {
  const h = harness(); try {
    const first = await runSandboxDaily(h.options(h.makeIo('runner-a'))); assert.equal(first.result.status, 'published'); assert.deepEqual(h.writes, ['push', 'create', 'merge']); assert.equal(h.fetches(), 2);
    const second = await runSandboxDaily(h.options(h.makeIo('runner-b'), 'attempt-2')); assert.equal(second.result.status, 'published'); assert.equal(second.runId, first.runId); assert.equal(h.fetches(), 2); assert.deepEqual(h.writes, ['push', 'create', 'merge']);
    const doc = JSON.parse(h.db.get(`${PREFIX}doc:operational`)!); assert.equal(doc.value.history.filter((e: { type: string }) => e.type === 'published').length, 1); assert.equal(doc.value.daily.runs[first.runId].phase, 'published'); assert.ok(first.digest.length < 1800);
  } finally { h.close(); }
});
test('legacy file fixture adapter runs same daily stages and emits compatible ledger/history/daily mirrors', async () => {
  const h = harness(); try { const result = await runSandboxDaily(h.options(h.makeIo('file-runner', true))); assert.equal(result.result.status, 'published'); const root = path.join(h.root, 'legacy-fixture'); assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'ledger.json'), 'utf8')).version, 1); assert.ok(fs.readFileSync(path.join(root, 'history.jsonl'), 'utf8').includes('published')); assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'daily-state.json'), 'utf8')).runs[result.runId]); } finally { h.close(); }
});
test('async long build exceeds original TTL but heartbeat renews; no synchronous build hidden in publisher', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('long-runner')); options.asyncRun = async (_cmd, args, signal) => { if (args[0] === 'build') for (let i = 0; i < 20; i++) { h.db.advance(100); await delay(5); assert.equal(signal.aborted, false); } return { code: 0, cwd: options.io.publicationRoot }; }; assert.equal((await runSandboxDaily(options)).result.status, 'published'); assert.ok(h.db.calls.filter(c => c.script === STATE_SCRIPTS.renew).length > 10); } finally { h.close(); }
});
test('renewal failure during async build aborts and prohibits every later publish write', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('failed-heartbeat')); options.asyncRun = async () => { h.db.fail('renew'); await delay(15); return { code: 0, cwd: options.io.publicationRoot }; }; await assert.rejects(runSandboxDaily(options)); assert.deepEqual(h.writes, []); const count = h.db.calls.length; await delay(10); assert.equal(h.db.calls.length, count, 'no leftover heartbeat watcher'); } finally { h.close(); }
});
test('multi-runner contention admits one daily writer only', async () => {
  const h = harness(); try { const a = h.options(h.makeIo('contender-a')), b = h.options(h.makeIo('contender-b')); a.asyncRun = async () => { await delay(10); return { code: 0, cwd: a.io.publicationRoot }; }; const outcomes = await Promise.allSettled([runSandboxDaily(a), runSandboxDaily(b)]); assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1); assert.deepEqual(h.writes, ['push', 'create', 'merge']); } finally { h.close(); }
});
test('final operational CAS conflict after real mocked merge: checkpoint + GitHub reconcile, no second data PR', async () => {
  const h = harness(); try {
    const io = h.makeIo('cas-failed'), original = io.cas; let failed = false;
    io.cas = async (version, value) => { if (!failed && value.daily.runs?.['offer-2026-11-06-morning']?.phase === 'published') { failed = true; const raw = JSON.parse(h.db.get(`${PREFIX}doc:operational`)!); raw.version++; h.db.set(`${PREFIX}doc:operational`, JSON.stringify(raw)); } await original(version, value); };
    await assert.rejects(runSandboxDaily(h.options(io))); assert.deepEqual(h.writes, ['push', 'create', 'merge']);
    const retry = await runSandboxDaily(h.options(h.makeIo('cas-repair'), 'attempt-repair')); assert.equal(retry.result.status, 'published'); assert.deepEqual(h.writes, ['push', 'create', 'merge']); assert.equal(h.fetches(), 2);
  } finally { h.close(); }
});
test('rollback rechecks owner after deployment failure and never issues revert when revoked', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('rollback-owner')); options.fetchDeployments = async () => { h.revokeOwner(); return [{ created: 1, name: 'opencard', target: 'production', readyState: 'ERROR', meta: { githubCommitSha: MERGE } }]; }; assert.equal((await runSandboxDaily(options)).result.status, 'uncertain'); assert.ok(!h.writes.includes('revert')); } finally { h.close(); }
});
test('missing backend configuration fails closed; never creates local fallback state', async () => {
  const h = harness(); try { assert.throws(() => redisSandboxState({ enabled: true, scratch: path.join(h.root, 'must-not-exist'), artifacts: path.join(h.root, 'disabled-artifacts'), cards: h.cards, seed: h.seed })); assert.equal(fs.existsSync(path.join(h.root, 'must-not-exist')), false); await assert.rejects(runSandboxDaily({ ...h.options(h.makeIo('disabled')), enabled: false })); assert.equal(h.db.calls.length, 0); } finally { h.close(); }
});

test('lease renewal failure immediately before rollback prohibits revert/push and leaves outcome unconfirmed', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('rollback-lease')); options.fetchDeployments = async () => { h.db.fail('renew'); return [{ created: 1, name: 'opencard', target: 'production', readyState: 'ERROR', meta: { githubCommitSha: MERGE } }]; }; await assert.rejects(runSandboxDaily(options)); assert.ok(!h.writes.includes('revert')); assert.equal(h.writes.filter(w => w === 'push').length, 1); } finally { h.close(); }
});
test('heartbeat misconfiguration and changed async-build input refuse before any publication', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('invalid-heartbeat')); options.heartbeatMs = 500; await assert.rejects(runSandboxDaily(options)); assert.equal(h.db.calls.length, 0); const changed = h.options(h.makeIo('changed-build')); changed.asyncRun = async () => { const file = path.join(h.root, 'scratch-changed-build', 'data', 'cards', 'fixture-card.json'); const card = JSON.parse(fs.readFileSync(file, 'utf8')); card.annual_fee = 999; fs.writeFileSync(file, JSON.stringify(card)); return { code: 0, cwd: changed.io.publicationRoot }; }; await assert.rejects(runSandboxDaily(changed)); assert.deepEqual(h.writes, []); } finally { h.close(); }
});

test('realpath-safe CLI guard supports renamed symlinks without running operational stage scripts', async () => {
  const { isOfferCli } = await import('./cli-entry'); const { pathToFileURL } = await import('node:url'); const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-cli-fixture-'));
  try { const target = path.join(root, 'fixture.ts'), link = path.join(root, 'renamed-link.ts'); fs.writeFileSync(target, '// inert fixture'); fs.symlinkSync(target, link); assert.equal(isOfferCli(pathToFileURL(target).href, link), true); assert.equal(isOfferCli(pathToFileURL(target).href, path.join(root, 'absent')), false); } finally { fs.rmSync(root, { recursive: true }); }
});

test('real async check runner uses spawn (not sync), fixed args and cancels child process group on lease abort', async () => {
  const { asyncOfferCheck } = await import('./async-check'); const { EventEmitter } = await import('node:events');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-check-fixture-'));
  try {
    const child = Object.assign(new EventEmitter(), { pid: 123456 }), killed: NodeJS.Signals[] = []; const controller = new AbortController(); let spawned = false;
    const pending = asyncOfferCheck('npm', ['run', 'build'], controller.signal, { cwd: root, killGraceMs: 5, spawnImpl: ((cmd: string, args: string[], options: { shell: boolean }) => { spawned = true; assert.equal(cmd, 'npm'); assert.deepEqual(args, ['run', 'build']); assert.equal(options.shell, false); return child; }) as unknown as typeof import('node:child_process').spawn, killGroup: (_pid, signal) => { killed.push(signal); queueMicrotask(() => child.emit('close', null)); } });
    assert.equal(spawned, true); controller.abort(); await assert.rejects(pending); assert.deepEqual(killed, ['SIGTERM', 'SIGKILL']);
    assert.throws(() => asyncOfferCheck('sh', ['-c', 'anything'], new AbortController().signal, { cwd: root }));
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('Codex regression P1: different publisher worktree must not publish validated scratch bytes', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('different-worktree')); const original = options.publisher.run; options.publisher.run = (cmd, args) => cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel' ? { code: 0, stdout: h.root, stderr: '' } : original(cmd, args); await assert.rejects(runSandboxDaily(options)); assert.deepEqual(h.writes, []); } finally { h.close(); }
});
test('Codex regression P2: leader closes after TERM but surviving process group still receives KILL', async () => {
  const { asyncOfferCheck } = await import('./async-check'); const { EventEmitter } = await import('node:events'); const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-group-fixture-'));
  try { const child = Object.assign(new EventEmitter(), { pid: 123456 }), killed: NodeJS.Signals[] = []; const controller = new AbortController(); const pending = asyncOfferCheck('npm', ['run', 'build'], controller.signal, { cwd: root, ...{ killGraceMs: 5 }, spawnImpl: (() => child) as unknown as typeof import('node:child_process').spawn, killGroup: (_pid, signal) => { killed.push(signal); if (signal === 'SIGTERM') queueMicrotask(() => child.emit('close', null)); } }); controller.abort(); await assert.rejects(pending); assert.deepEqual(killed, ['SIGTERM', 'SIGKILL']); } finally { fs.rmSync(root, { recursive: true }); }
});
test('Codex regression P3: nonempty restored file journals/claims are never silently discarded', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-seed-fixture-'));
  try {
    fs.writeFileSync(path.join(root, 'offer-state.sandbox.json'), JSON.stringify({ schema: 1, sandbox: true, fixtureId: 'restore-fixture' })); fs.writeFileSync(path.join(root, 'ledger.json'), JSON.stringify(emptyLedger())); fs.writeFileSync(path.join(root, 'history.jsonl'), ''); fs.writeFileSync(path.join(root, 'daily-state.json'), '{}');
    fs.writeFileSync(path.join(root, 'journals.json'), JSON.stringify([{ version: 1, runId: 'restored-run', phase: 'push_intent', files: [FILE], fingerprints: ['outstanding-fp'], headSha: HEAD }])); fs.writeFileSync(path.join(root, 'claims.json'), JSON.stringify({ 'outstanding-fp': 'restored-run' }));
    assert.throws(() => fileFixtureState({ root, scratch: path.join(root, 'must-not-create'), artifacts: path.join(root, 'artifacts'), cards: new Map() }), /journal|claim|restore/i); assert.equal(fs.existsSync(path.join(root, 'must-not-create')), false);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('P1 regression: async check receipt from another cwd is refused before staging/push', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('wrong-check-root')); options.asyncRun = async () => ({ code: 0, cwd: h.root }); await assert.rejects(runSandboxDaily(options)); assert.deepEqual(h.writes, []); } finally { h.close(); }
});
for (const stage of ['index', 'commit'] as const) test(`P1 regression: ${stage} bytes differ from validated bytes, no push`, async () => {
  const h = harness(); try { const options = h.options(h.makeIo(`wrong-${stage}`)), original = options.publisher.run; options.publisher.run = (cmd, args) => cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--verify' && (stage === 'index' ? args[2].startsWith(':') : args[2].startsWith('HEAD:')) ? { code: 0, stdout: 'f'.repeat(40), stderr: '' } : original(cmd, args); const result = await runSandboxDaily(options); assert.equal(result.result.status, 'precondition_failed'); assert.deepEqual(h.writes, []); } finally { h.close(); }
});
test('P1 regression: bytes change after validation but before publish are refused', async () => {
  const h = harness(); try { const options = h.options(h.makeIo('late-bytes')), original = options.publisher.run; let reads = 0; options.publisher.run = (cmd, args) => { if (cmd === 'git' && args[0] === 'hash-object' && ++reads === 2) return { code: 0, stdout: 'f'.repeat(40), stderr: '' }; return original(cmd, args); }; await assert.rejects(runSandboxDaily(options)); assert.deepEqual(h.writes, []); } finally { h.close(); }
});
test('P1 regression: immutable SHA is pushed; resumed remote tree must still match validated bytes', async () => {
  const h = harness(); try { await runSandboxDaily(h.options(h.makeIo('immutable-sha'))); assert.match(h.pushRefs[0], /^[0-9a-f]{40}:refs\/heads\/bot\/offer-watch\//); const options = h.options(h.makeIo('wrong-remote-tree'), 'attempt-resume'), original = options.publisher.run; options.publisher.run = (cmd, args) => cmd === 'gh' && args[0] === 'api' && args[1].includes('/git/trees/') ? { code: 0, stdout: JSON.stringify({ truncated: false, tree: [{ path: FILE, sha: 'f'.repeat(40), mode: '100644', type: 'blob' }] }), stderr: '' } : original(cmd, args); const result = await runSandboxDaily(options); assert.equal(result.result.status, 'uncertain'); assert.deepEqual(h.writes, ['push', 'create', 'merge']); } finally { h.close(); }
});
