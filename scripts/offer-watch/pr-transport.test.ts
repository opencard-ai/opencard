import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOfferPrTransport } from './pr-transport';
import { privateFileJournal, type OfferJournal, type OfferJournalStore } from './publish-journal';
import { publish, type PublishDeps, type PublishConfig } from './publish-core';
import { emptyLedger } from './gate';
import { upsertLedger, saveLedger, loadLedger, appendHistory, readHistory } from './state';
const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), MERGE = 'c'.repeat(40), REVERT_HEAD = 'd'.repeat(40), REVERT = 'e'.repeat(40);
const FILE = 'data/cards/fixture-card.json';
const card = { card_id: 'fixture-card', file: FILE, sources: ['https://example.invalid/issuer'], changes: [{ field: 'welcome_offer.bonus_points', old_value: 10000, new_value: 20000, fingerprint: 'synthetic-fingerprint' }] };
const cfg: PublishConfig = { branch: 'main', remote: 'origin', vercelProject: 'opencard', vercelScope: 'opencard-ais-projects', siteBase: 'https://example.invalid', checks: [['npm', 'run', 'validate']], deployTimeoutMs: 30, deployPollMs: 10, liveTimeoutMs: 50, livePollMs: 10 };
function fixture(options: { checkChanges?: boolean; headChanges?: boolean; emptyChecks?: boolean; mergeUnknown?: boolean; mergeNonMerged?: boolean; stateFail?: string; deploy?: string; liveMismatch?: boolean; rollbackFails?: boolean; rollbackDeployFails?: boolean; authorityChanges?: boolean; gate?: 'publish' | 'enable' | 'epoch' | 'owner' } = {}) {
  const calls: string[][] = [], records = new Map<string, OfferJournal>(), claims = new Map<string, string>();
  let localHead = BASE, rollback = false, authReads = 0, checkReads = 0, stateFailed = false;
  type Pr = { number: number; state: string; headRefOid: string; baseRefName: string; isDraft: boolean; files: { path: string }[]; mergeCommit?: { oid: string } };
  const prs: Pr[] = [];
  const store: OfferJournalStore = {
    load: id => structuredClone(records.get(id) ?? null),
    claim: (fps, id) => { for (const fp of fps) { if (claims.has(fp) && claims.get(fp) !== id) throw new Error('claimed'); claims.set(fp, id); } },
    save: j => { if (!stateFailed && options.stateFail === j.phase) { stateFailed = true; throw new Error('simulated private state outage'); } records.set(j.runId, structuredClone(j)); },
  };
  const run = (command: string, args: string[]) => {
    calls.push([command, ...args]); const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' }); const json = (v: unknown) => ok(JSON.stringify(v));
    if (command === 'npm') return ok();
    if (command === 'git') {
      if (args[0] === 'rev-parse') return ok(args.includes('--abbrev-ref') ? 'main' : args[1] === 'origin/main' ? BASE : localHead);
      if (args[0] === 'status') return ok(` M ${FILE}`);
      if (args.includes('commit')) { localHead = HEAD; return ok(); }
      if (args.includes('revert')) { if (options.rollbackFails) return { code: 1, stdout: '', stderr: 'fixture revert conflict' }; rollback = true; localHead = REVERT_HEAD; return ok(); }
      if (args[0] === 'remote') return ok('https://github.com/opencard-ai/opencard.git');
      if (args[0] === 'diff') return ok(FILE);
      if (args[0] === 'log') return ok('opencard@opencardai.com');
      if (['add', 'push', 'ls-remote', 'fetch', 'checkout'].includes(args[0])) return ok();
    }
    if (command === 'gh') {
      if (args[0] === 'api' && args[1].includes('runner-owner')) {
        authReads++;
        return json({ content: Buffer.from(JSON.stringify({ version: 1, offer: { owner: options.gate === 'owner' || (options.authorityChanges && authReads > 2) ? 'mac' : 'github-actions', productionEnabled: true, epoch: 'fixture-epoch' } })).toString('base64') });
      }
      if (args[0] === 'api') return json({ object: { sha: BASE } });
      if (args[1] === 'list') { const isRollback = args[args.indexOf('--head') + 1].includes('-rollback/'); return json(prs.filter(p => (p.number === 2) === isRollback).map(p => ({ number: p.number }))); }
      if (args[1] === 'create') { prs.push({ number: rollback ? 2 : 1, state: 'OPEN', headRefOid: localHead, files: [{ path: FILE }], baseRefName: 'main', isDraft: false }); return ok('https://example.invalid/pr'); }
      if (args[1] === 'view') { const pr = prs.find(p => p.number === Number(args[2])); return json(options.headChanges && checkReads > 0 ? { ...pr, headRefOid: REVERT_HEAD } : pr); }
      if (args[1] === 'checks') { checkReads++; return json(options.emptyChecks ? [] : ['validate', 'gitleaks'].map(name => ({ name, state: options.checkChanges && checkReads === 2 ? 'PENDING' : 'SUCCESS', bucket: options.checkChanges && checkReads === 2 ? 'pending' : 'pass' }))); }
      if (args[1] === 'merge') {
        const pr = prs.find(p => p.number === Number(args[2]))!;
        if (!options.mergeNonMerged) { pr.state = 'MERGED'; pr.mergeCommit = { oid: pr.number === 2 ? REVERT : MERGE }; }
        if (options.mergeUnknown && pr.number === 1) return { code: 1, stdout: '', stderr: 'fixture lost receipt' };
        return ok();
      }
    }
    throw new Error(`unhandled MOCK command ${command} ${args.join(' ')}`);
  };
  const deployments: string[] = [];
  const transport = createOfferPrTransport({ run, publish: options.gate !== 'publish', productionEnable: options.gate !== 'enable', ownerEpoch: options.gate === 'epoch' ? 'wrong' : 'fixture-epoch', runId: 'fixture-morning', store,
    fetchDeployments: async mergeSha => {
      deployments.push(mergeSha);
      return [{ uid: 'fixture-deploy', name: 'opencard', target: options.deploy === 'preview' ? 'preview' : 'production', meta: { githubCommitSha: options.deploy === 'wrong-sha' ? HEAD : mergeSha }, readyState: mergeSha === REVERT ? options.rollbackDeployFails ? 'ERROR' : 'READY' : options.deploy === 'error' ? 'ERROR' : 'READY' }];
    },
  });
  const deps: PublishDeps = { run, transport, fetchText: async () => ({ status: 200, text: `${rollback || options.liveMismatch ? '10,000' : '20,000'} pts $0 Annual Fee` }), readCard: () => ({ annual_fee: 0, welcome_offer: { bonus_points: 20000 } }), now: () => new Date(0), sleep: async () => {}, log: () => {} };
  return { deps, transport, calls, records, deployments, prs, store };
}
const forbidden = (calls: string[][]) => assert.ok(!calls.some(c => c.includes('--force') || c.includes('--auto') || c.includes('--rebase') || (c[1] === 'push' && !c.some(a => /^(?:HEAD|[0-9a-f]{40}):refs\/heads\/bot\/offer-watch(?:-rollback)?\//.test(a)))));
test('real core → fixed helper → explicit checks → squash SHA → production evidence → live values', async () => {
  const f = fixture(), result = await publish([card], cfg, f.deps);
  assert.equal(result.status, 'published'); assert.equal(result.commits[0].sha, MERGE); assert.ok(f.deployments.every(s => s === MERGE));
  assert.equal(f.calls.filter(c => c[2] === 'checks').length, 2);
  assert.ok(f.calls.some(c => c.includes('--match-head-commit') && c.includes(HEAD)));
  assert.ok(f.calls.filter(c => c[1] === 'push').every(c => !c.join(' ').includes('ledger'))); forbidden(f.calls);
});
test('missing fixed helper refuses before all side effects', async () => { const f = fixture(); delete f.deps.transport; assert.equal((await publish([card], cfg, f.deps)).status, 'precondition_failed'); assert.deepEqual(f.calls, []); });
for (const gate of ['publish', 'enable', 'epoch', 'owner'] as const) test(`missing/invalid ${gate} fails closed`, async () => { const f = fixture({ gate }); assert.equal((await publish([card], cfg, f.deps)).status, 'precondition_failed'); assert.ok(!f.calls.some(c => c.includes('push') || c.includes('commit'))); });
test('changed authority is re-read before external writes', async () => { const f = fixture({ authorityChanges: true }); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); assert.ok(!f.calls.some(c => c[1] === 'push')); });
for (const mode of ['checkChanges', 'headChanges', 'emptyChecks', 'mergeNonMerged'] as const) test(`${mode}: never pretend merged or deploy`, async () => {
  const f = fixture({ [mode]: true }); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); assert.equal(f.deployments.length, 0);
  if (mode !== 'mergeNonMerged') assert.ok(!f.calls.some(c => c[2] === 'merge')); forbidden(f.calls);
});
test('lost merge receipt reconciles same remote PR and does not push/create/merge a second time', async () => {
  const f = fixture({ mergeUnknown: true }); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain');
  const writes = () => f.calls.filter(c => c[1] === 'push' || c[2] === 'create' || c[2] === 'merge').length;
  const before = writes(); assert.equal((await publish([card], cfg, f.deps)).status, 'published'); assert.equal(writes(), before);
});
test('remote merge succeeded / journal failed: reconcile before replay, then repair private synthetic ledger/history', async () => {
  const f = fixture({ stateFail: 'merged' }); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain');
  const pushes = f.calls.filter(c => c[1] === 'push').length;
  const result = await publish([card], cfg, f.deps); assert.equal(result.status, 'published'); assert.equal(f.calls.filter(c => c[1] === 'push').length, pushes);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-private-fixture-'));
  try {
    const ledger = path.join(root, 'ledger.json'), history = path.join(root, 'history.jsonl');
    saveLedger(upsertLedger(emptyLedger(), result.ledger, 'fixture'), ledger); appendHistory(result.events, history);
    assert.equal(Object.values(loadLedger(ledger).entries)[0].commit, MERGE); assert.equal(readHistory(history)[0].commit, MERGE);
  } finally { fs.rmSync(root, { recursive: true }); }
});
test('state failure before push prevents any external publication', async () => { const f = fixture({ stateFail: 'push_intent' }); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); assert.ok(!f.calls.some(c => c[1] === 'push')); });
for (const deploy of ['preview', 'wrong-sha']) test(`${deploy} cannot establish production; no speculative rollback`, async () => { const f = fixture({ deploy }); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); assert.ok(!f.calls.some(c => c.includes('revert'))); });
for (const mode of ['error', 'live-mismatch']) test(`${mode} → revert actual squash → checked PR → actual revert merge/deploy/page`, async () => {
  const f = fixture({ deploy: mode === 'error' ? 'error' : undefined, liveMismatch: mode === 'live-mismatch' });
  const result = await publish([card], cfg, f.deps); assert.equal(result.status, mode === 'error' ? 'deploy_failed' : 'live_check_failed');
  assert.deepEqual(result.reverted, [REVERT]); assert.equal(result.events[0].type, 'rolled_back');
  assert.ok(f.calls.some(c => c.includes('revert') && c.includes(MERGE))); assert.ok(f.deployments.includes(REVERT)); forbidden(f.calls);
});
test('revert failure is UNCERTAIN, never reported rolled_back', async () => { const f = fixture({ deploy: 'error', rollbackFails: true }); const r = await publish([card], cfg, f.deps); assert.equal(r.status, 'uncertain'); assert.deepEqual(r.events, []); forbidden(f.calls); });
test('revert PR merged but deployment failed: restoration unconfirmed', async () => { const f = fixture({ deploy: 'error', rollbackDeployFails: true }); const r = await publish([card], cfg, f.deps); assert.equal(r.status, 'uncertain'); assert.deepEqual(r.events, []); });
test('rerun after rollback never republishes or reverts again', async () => { const f = fixture({ deploy: 'error' }); await publish([card], cfg, f.deps); const before = f.calls.filter(c => c[1] === 'push').length; assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); assert.equal(f.calls.filter(c => c[1] === 'push').length, before); });
test('fingerprint claimed by another run blocks publication', async () => { const f = fixture(); f.store.claim([card.changes[0].fingerprint], 'different-run'); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); assert.ok(!f.calls.some(c => c[1] === 'push')); });
test('private file journal metadata roundtrip, cross-run claim refusal, never inside repo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-journal-fixture-'));
  try { const store = privateFileJournal(root); const record: OfferJournal = { version: 1, runId: 'fixture-run', fingerprints: ['fixture-fp'], files: [FILE], phase: 'prepared' }; store.claim(record.fingerprints, record.runId); store.claim(record.fingerprints, record.runId); store.save(record); assert.deepEqual(store.load(record.runId), record); assert.throws(() => store.claim(record.fingerprints, 'other-run')); assert.throws(() => privateFileJournal(process.cwd())); }
  finally { fs.rmSync(root, { recursive: true }); }
});

test('branch pushed but private receipt state failed: rerun refuses a blind second push/create', async () => { const f = fixture({ stateFail: 'branch_pushed' }); assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); const before = f.calls.filter(c => c[1] === 'push').length; assert.equal((await publish([card], cfg, f.deps)).status, 'uncertain'); assert.equal(f.calls.filter(c => c[1] === 'push').length, before); });
