/** Real temporary Git repos/worktrees; EVERY GitHub/Vercel/remote Git operation is mocked. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runSandboxDaily } from './daily';
import { redisSandboxState } from './sandbox-state';
import { createRedisOfferState } from './redis-state';
import { mockRedis } from './redis-state.fixtures';
import { emptyLedger, type CardRecord } from './gate';
const FILE = 'data/cards/fixture-card.json', NOW = Date.parse('2026-11-06T20:00:00Z');
export function createAcceptanceFixture(fixtureOptions: { prettyMulti?: boolean; checker?: boolean; faultWait?: boolean; stateFactory?: (runnerId: string) => ReturnType<typeof createRedisOfferState> } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-real-git-')), db = mockRedis();
  const home = path.join(root, 'home'); fs.mkdirSync(home, { mode: 0o700 });
  const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_DATE: '2026-11-06T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-06T00:00:00Z' };
  const cards = new Map<string, CardRecord>([['fixture-card', { card_id: 'fixture-card', name: 'Synthetic Card', annual_fee: 0, welcome_offer: { bonus_points: 10000, spending_requirement: 1000, time_period_months: 3, point_program: 'Fixture Points', description: 'Synthetic baseline', is_elevated: false }, sources: [] }]]);
  if (fixtureOptions.prettyMulti) cards.set('unchanged-card', { ...structuredClone(cards.get('fixture-card')!), card_id: 'unchanged-card', name: 'Untouched Synthetic Card' });
  const local = (cwd: string, args: string[]) => {
    // Never allow a network-capable Git command to escape into an actual subprocess.
    if (args.some(a => ['push', 'pull', 'fetch', 'clone', 'ls-remote'].includes(a))) throw new Error('network Git forbidden in fixture');
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  let base = '', remoteHead = '', remoteMerge = '', remoteTree: Array<{ mode: string; type: string; sha: string; path: string }> = [];
  let exists = false, merged = false, failChecks = false, fetches = 0, remoteMain = '', rollingBack = false;
  let hook: (() => void) | undefined;
  const writes: string[] = [];
  const make = (id: string) => {
    let repo = path.join(root, id); const artifacts = path.join(root, `${id}-private-artifacts`); fs.mkdirSync(repo, { mode: 0o700 });
    const must = (args: string[]) => { const r = local(repo, args); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
    must(['init', '-b', 'main']); must(['config', 'user.name', 'Synthetic Fixture']); must(['config', 'user.email', 'fixture@example.invalid']);
    fs.mkdirSync(path.join(repo, 'data/cards'), { recursive: true }); fs.mkdirSync(path.join(repo, 'src'));
    for (const [id, value] of cards) fs.writeFileSync(path.join(repo, 'data/cards', `${id}.json`), fixtureOptions.prettyMulti ? JSON.stringify(value, null, 2) + '\n' : JSON.stringify(value)); fs.writeFileSync(path.join(repo, 'src/app.ts'), 'export const fixture = true;\n');
    fs.writeFileSync(path.join(repo, '.gitignore'), 'ignored-artifact/\n.next/\n');
    if (fixtureOptions.checker) {
      fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ private: true, scripts: { validate: 'node check-fixture.cjs', build: 'node check-fixture.cjs' } }));
      fs.writeFileSync(path.join(repo, 'check-fixture.cjs'), `const fs = require('node:fs'), path = require('node:path'); fs.mkdirSync(path.join(process.env.HOME, '.npm', '_logs'), { recursive: true }); fs.writeFileSync(path.join(process.env.HOME, '.npm', '_logs', 'synthetic.log'), 'fixture'); fs.writeFileSync(path.join(process.cwd(), '..', 'checker-receipt.json'), JSON.stringify({ home: process.env.HOME, cache: process.env.npm_config_cache, temp: process.env.TMPDIR }));${fixtureOptions.faultWait ? `process.on('SIGTERM',()=>{});fs.writeFileSync(path.join(process.cwd(),'..','fault-child.pid'),String(process.pid));setInterval(()=>{},100);` : ''}`);
    }
    must(['add', '.']); must(['commit', '-m', 'Synthetic baseline']); const thisBase = must(['rev-parse', 'HEAD']); if (base) assert.equal(thisBase, base); else { base = thisBase; remoteMain = base; }
    must(['branch', '-m', 'fixture-base']);
    const linked = path.join(root, `${id}-linked`); must(['worktree', 'add', '-b', 'main', linked, thisBase]); repo = linked; fs.chmodSync(repo, 0o700);
    const state = fixtureOptions.stateFactory ? fixtureOptions.stateFactory(id) : createRedisOfferState({ enabled: true, prefix: 'opencard:offer-state:{sandbox-realgit01}:', transport: db.transport, runnerId: id, ttlMs: 60000 });
    if (!state) throw new Error('injected state missing; fixture fallback prohibited');
    const io = redisSandboxState({ enabled: true, state, scratch: repo, artifacts, cards, seed: { schema: 1, ledger: emptyLedger(), history: [], daily: {} } });
    const tree = (ref: string) => must(['ls-tree', '-r', '-z', ref]).split('\0').filter(Boolean).map(entry => { const m = /^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(entry)!; return { mode: m[1], type: m[2], sha: m[3], path: m[4] }; });
    const run = (cmd: string, args: string[]) => {
      const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' }), json = (v: unknown) => ok(JSON.stringify(v));
      if (cmd === 'git') {
        if (args[0] === 'fetch') { must(['update-ref', 'refs/remotes/origin/main', remoteMain]); return ok(); }
        if (args[0] === 'push') { assert.match(args.at(-1)!, /^[0-9a-f]{40}:refs\/heads\/bot\/offer-watch(?:-rollback)?\//); assert.ok(!args.includes('--force')); writes.push('push'); remoteHead = args.at(-1)!.split(':')[0]; remoteTree = tree(remoteHead); return ok(); }
        if (args[0] === 'ls-remote') return ok(exists ? remoteHead : '');
        if (args[0] === 'remote') return ok('https://github.com/opencard-ai/opencard.git');
        return local(repo, args);
      }
      if (cmd === 'gh') {
        if (args[0] === 'api' && args[1].includes('runner-owner')) return json({ content: Buffer.from(JSON.stringify({ version: 1, offer: { owner: 'github-actions', productionEnabled: true, epoch: 'fixture-epoch' } })).toString('base64') });
        if (args[0] === 'api' && args[1].includes('/git/trees/')) return json({ truncated: false, tree: remoteTree });
        if (args[0] === 'api') return json({ object: { sha: remoteMain } });
        if (args[1] === 'list') return json(exists ? [{ number: 1 }] : []);
        if (args[1] === 'view') return json({ headRefOid: remoteHead, baseRefName: 'main', isDraft: false, state: merged ? 'MERGED' : 'OPEN', files: [{ path: FILE }], mergeCommit: merged ? { oid: remoteMerge } : null });
        if (args[1] === 'checks') { hook?.(); return json(['validate', 'gitleaks'].map(name => ({ name, state: failChecks ? 'PENDING' : 'SUCCESS', bucket: failChecks ? 'pending' : 'pass' }))); }
        if (args[1] === 'create') { writes.push('create'); exists = true; merged = false; rollingBack = args[args.indexOf('--head') + 1].includes('-rollback/'); return ok(); }
        if (args[1] === 'merge') { assert.equal(args[args.indexOf('--match-head-commit') + 1], remoteHead); assert.ok(args.includes('--squash')); writes.push('merge'); merged = true; remoteMerge = remoteHead; remoteMain = remoteMerge; return ok(); }
      }
      throw new Error('unexpected fixture operation');
    };
    const options: Parameters<typeof runSandboxDaily>[0] = {
      enabled: true, io, today: '2026-11-06', slot: 'morning', attemptId: id, now: NOW, heartbeatMs: 100, registry: new Set(), officialDomains: ['americanexpress.com'],
      entries: [{ card_id: 'fixture-card', sources: [{ url: 'https://www.americanexpress.com/fixture', patterns: [] }] }],
      fetch: async (source, attempt) => { fetches++; return { url: source.url, fetch_id: `fixture-${attempt}`, checked_at: new Date(NOW).toISOString(), ok: true, official_domain: true, values: { 'welcome_offer.bonus_points': 20000 } }; },
      validate: async signal => !signal.aborted,
      asyncRun: async (_cmd, _args, signal, context) => ({ code: signal.aborted ? 1 : 0, cwd: context.cwd }),
      publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch',
      config: { branch: 'main', remote: 'origin', vercelProject: 'opencard', vercelScope: 'fixture', siteBase: 'https://example.invalid', checks: [['fixture-check', 'validate'], ['fixture-check', 'build']], deployTimeoutMs: 10, deployPollMs: 10, liveTimeoutMs: 10, livePollMs: 10 },
      publisher: { run, fetchText: async () => ({ status: 200, text: `${rollingBack ? '10,000' : '20,000'} pts Spend $1,000 within 3 months $0 Annual Fee` }), sleep: async () => {}, now: () => new Date(NOW), log: () => {} },
      fetchDeployments: async sha => [{ created: 1, name: 'opencard', target: 'production', readyState: 'READY', meta: { githubCommitSha: sha } }],
    };
    return { repo, io, options, must, run, tree };
  };
  return { make, writes, db, fetches: () => fetches, moveMain: () => { remoteMain = 'f'.repeat(40); }, checks: (fail: boolean) => { failChecks = fail; }, hook: (fn: () => void) => { hook = fn; }, corruptRemote: () => { remoteTree = remoteTree.map(e => e.path === 'src/app.ts' ? { ...e, sha: 'f'.repeat(40) } : e); }, close: () => fs.rmSync(root, { recursive: true }) };
}
