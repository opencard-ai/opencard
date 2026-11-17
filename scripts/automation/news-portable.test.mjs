import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NEWS_SOURCES, runNewsSync } from '../sync-news.mjs';
import { parseRSS } from '../news-sync-core.mjs';
import { createMiniMaxTranslator } from '../news-provider.mjs';
import { preparePortableNews, jsonHash, writeShadowArtifacts } from './news-portable.mjs';
import { publishPortableNews, observeNewsDeployment } from './news-publish.mjs';
import { mergeVerifiedNewsPr } from './pr-merge-guard.mjs';
import { parsePublishOptions } from './news-publish-cli.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/news.json', import.meta.url), 'utf8'));
const sha = 'a'.repeat(40), head = 'b'.repeat(40), mergeSha = 'c'.repeat(40);
const translationResponse = { content: [{ type: 'text', text: JSON.stringify([{ idx: 0, title: 'translated', summary: 'summary' }]) }] };
const provider = createMiniMaxTranslator({ apiKey: 'synthetic-test-only', fetchImpl: async () => ({ ok: true, json: async () => translationResponse }) });
const prepare = extra => preparePortableNews({ previous: { items: [] }, sourceSha: sha, now: '2026-11-06T20:00:00Z', slot: 'morning', runId: 'test-1',
  sources: fixture.sources, fetchSource: async src => parseRSS(src.rss), translate: provider, ...extra });

test('real exported sync path uses normal RSS sources and explicit provider, dedups and reuses translations', async () => {
  assert.deepEqual(NEWS_SOURCES.map(s => new URL(s.url).hostname), ['www.doctorofcredit.com', 'www.doctorofcredit.com']);
  let fetches = 0, translations = 0;
  const fetchImpl = async () => { fetches++; return { ok: true, text: async () => fixture.sources[0].rss }; };
  const translate = async (...args) => { translations++; return provider(...args); };
  const first = await runNewsSync({ previous: { items: [] }, fetchImpl, translate, now: new Date('2026-11-06T20:00:00Z') });
  assert.equal(fetches, 2); assert.equal(first.output.items.length, 1); assert.equal(translations, 2);
  const second = await runNewsSync({ previous: first.output, fetchImpl, translate, now: new Date('2026-11-06T21:00:00Z') });
  assert.equal(second.changed, false); assert.equal(translations, 2);
  assert.deepEqual(second.output, first.output);
});
test('portable job slot is stable across main changes; source SHA is metadata', async () => {
  const first = await prepare();
  assert.equal(first.plan.slotKey, 'news:2026-11-06:morning');
  assert.equal(first.plan.proposedSha256, jsonHash(first.proposed));
  assert.notEqual(first.plan.slotKey, (await prepare({ slot: 'evening' })).plan.slotKey);
  assert.equal(first.plan.slotKey, (await prepare({ sourceSha: head })).plan.slotKey);
});
test('provider rejects HTTP/malformed/partial/network/timeout with secret-free errors', async () => {
  const candidates = parseRSS(fixture.sources[0].rss);
  for (const fetchImpl of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ content: [] }) }),
    async () => ({ ok: true, json: async () => ({ content: [{ text: '[{"idx":0,"title":"partial"}]' }] }) }),
    async () => { throw new Error('synthetic-private-value'); }, async () => ({ ok: true, json: async () => new Promise(() => {}) }), async () => new Promise(() => {})]) {
    const translate = createMiniMaxTranslator({ apiKey: 'synthetic-private-value', fetchImpl, timeoutMs: 5 });
    await assert.rejects(translate(candidates, 'zh'), error => /unavailable/.test(error.message) && !error.message.includes('synthetic-private-value'));
  }
  await assert.rejects(createMiniMaxTranslator({ apiKey: '' })(candidates, 'zh'), /credential/);
});
test('source failure and truncated RSS abort real pipeline before translations/output', async () => {
  let translated = 0;
  const translate = async () => { translated++; throw new Error('should not run'); };
  await assert.rejects(runNewsSync({ previous: { items: [] }, translate, fetchImpl: async () => ({ ok: false, status: 503 }) }));
  await assert.rejects(runNewsSync({ previous: { items: [] }, translate, fetchImpl: async () => ({ ok: true, text: async () => '<rss><channel><item>' }) }));
  assert.equal(translated, 0);
});
test('re-reading head also re-reads checks; a newly pending check prevents merge', async () => {
  let checks = 0, merged = false;
  const pr = { headRefOid: head, state: 'OPEN', baseRefName: 'main', isDraft: false, files: [{ path: 'data/news.json' }] };
  await assert.rejects(mergeVerifiedNewsPr({ prNumber: 1, expectedHead: head, write: true, run: async (_, args) => {
    if (args[1] === 'merge') { merged = true; throw new Error('must not merge'); }
    if (args[1] === 'checks') return { code: 0, stdout: JSON.stringify([{ name: 'validate', state: ++checks === 1 ? 'SUCCESS' : 'PENDING', bucket: checks === 1 ? 'pass' : 'pending' }]) };
    return { code: 0, stdout: JSON.stringify(pr) };
  } }), /checks/);
  assert.equal(checks, 2); assert.equal(merged, false);
});

function liveMock(result, options = {}) {
  const calls = [], scratch = [];
  let prLists = 0, ownerReads = 0;
  const run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const ok = value => ({ code: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value) });
    if (cmd === 'gh' && args[0] === 'api') {
      if (args[1].includes('ops/runner-owner')) {
        ownerReads++;
        const news = { owner: options.denied || (options.revoke && ownerReads > 3) ? 'mac' : 'github-actions', productionEnabled: true, epoch: 'fixture-epoch' };
        return ok({ content: Buffer.from(JSON.stringify({ version: 1, news })).toString('base64') });
      }
      if (args[1].includes('contents/data/news.json')) return ok({ content: Buffer.from(JSON.stringify(result.proposed)).toString('base64') });
      if (args[1].includes('git/ref')) return ok({ object: { sha: options.stale ? head : sha } });
      if (args[1].includes('/status')) return ok({ sha: mergeSha, statuses: [{ context: 'Vercel', state: 'success' }] });
    }
    if (cmd === 'git') {
      if (args.includes('remote')) return ok('https://github.com/opencard-ai/opencard.git');
      if (args.includes('ls-remote')) return ok('');
      if (args.includes('worktree')) {
        if (args.includes('add')) { const dir = args.at(-2); scratch.push(path.dirname(dir)); fs.mkdirSync(path.join(dir, 'data'), { recursive: true }); }
        else fs.rmSync(args.at(-1), { recursive: true, force: true });
        return ok('');
      }
      if (args.includes('diff')) return ok('data/news.json\n');
      if (args.includes('log')) return ok('opencard@opencardai.com');
      if (args.includes('rev-parse')) return ok(head);
      if (args.includes('rev-list')) return ok('1');
      return ok('');
    }
    if (args[1] === 'list') {
      prLists++;
      if (options.existing && prLists === 1) return ok([{ number: 7, state: 'OPEN', headRefOid: head }]);
      return ok(prLists === 3 ? [{ number: 7 }] : []);
    }
    if (args[1] === 'checks') return ok(['validate', 'gitleaks'].map(name => ({ name, bucket: options.pending ? 'pending' : 'pass', state: options.pending ? 'PENDING' : 'SUCCESS' })));
    if (args[1] === 'view') return ok(args.at(-1) === 'state,mergeCommit' ? { state: 'MERGED', mergeCommit: { oid: mergeSha } } : { headRefOid: head, state: 'OPEN', baseRefName: 'main', isDraft: false, files: [{ path: 'data/news.json' }] });
    return ok('');
  };
  const fetchLive = async () => ({ status: 200, data: { items: result.proposed.items.map(i => ({ ...i, title: i.title_en || i.title, summary: i.summary_en || '' })), fetched: result.proposed.fetched } });
  const fetchDeployment = async () => [{ name: 'opencard', target: 'production', meta: { githubCommitSha: mergeSha }, readyState: 'READY' }];
  return { calls, scratch, run, fetchLive, fetchDeployment };
}

test('live writer is disabled before any command, remote authority/epoch/base fail closed', async () => {
  const result = await prepare();
  const base = { ...result, repoPath: '/fixture/repo', ownerEpoch: 'fixture-epoch', fetchDeployment: async () => [] };
  const noCommands = async () => { throw new Error('unexpected command'); };
  await assert.rejects(publishPortableNews({ ...base, run: noCommands }), /disabled/);
  for (const options of [{ denied: true }, { stale: true }]) {
    const m = liveMock(result, options);
    await assert.rejects(publishPortableNews({ ...base, publish: true, productionEnable: true, ...m }));
    assert.equal(m.calls.some(c => c[0] === 'git'), false);
    assert.equal(m.calls.some(c => ['create', 'merge'].includes(c[2])), false);
  }
});
test('portable PR→fresh checks→SHA-bound merge→deployment readback works with mocks only', async () => {
  const result = await prepare(), m = liveMock(result);
  try {
    const receipt = await publishPortableNews({ ...result, ...m, repoPath: '/fixture/repo', publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch' });
    assert.equal(receipt.state, 'MERGED'); assert.equal(receipt.deployment, 'VERIFIED');
    assert.ok(m.scratch.every(p => !fs.existsSync(p)), 'temporary worktree/scratch removed');
    assert.equal(m.calls.filter(c => c[0] === 'git' && c.includes('push')).length, 1);
    assert.ok(m.calls.find(c => c[0] === 'git' && c.includes('push')).at(-1).includes('refs/heads/bot/news-sync/'));
    assert.ok(m.calls.find(c => c[2] === 'merge').includes('--match-head-commit'));
    assert.ok(!m.calls.filter(c => c.includes('push') || c[2] === 'merge').flat().some(c => c === '--auto' || c === '--force'));
  } finally { m.scratch.forEach(p => fs.rmSync(p, { recursive: true, force: true })); }
});
test('pending checks or authority revoked before merge never merges; resume avoids duplicate PR', async () => {
  const result = await prepare();
  for (const options of [{ pending: true }, { revoke: true }]) {
    const m = liveMock(result, options);
    try {
      await assert.rejects(publishPortableNews({ ...result, ...m, repoPath: '/fixture/repo', publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch' }),
        // Pending stays a rejection but is identifiable/resumable; revoked authority is never "pending".
        error => options.pending ? error.code === 'CHECKS_PENDING' && error.pr === 7 && error.head === head && /^bot\/news-sync\/[0-9a-f]{24}$/.test(error.branch) : error.code !== 'CHECKS_PENDING');
      assert.equal(m.calls.some(c => c[2] === 'merge'), false);
      assert.ok(m.scratch.every(p => !fs.existsSync(p)), 'failed publication scratch removed');
    } finally { m.scratch.forEach(p => fs.rmSync(p, { recursive: true, force: true })); }
  }
  const m = liveMock(result, { existing: true });
  const receipt = await publishPortableNews({ ...result, ...m, repoPath: '/fixture/repo', publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch', reconcileExisting: true });
  assert.equal(receipt.state, 'MERGED');
  assert.equal(m.calls.some(c => (c[0] === 'git' && !c.includes('remote')) || c[2] === 'create'), false);
});
test('deployment mismatch/timeout/API errors never count as verified or trigger rollback', async () => {
  const result = await prepare();
  for (const run of [async () => ({ code: 1, stdout: '' }), async () => ({ code: 0, stdout: JSON.stringify({ sha: head, statuses: [{ context: 'Vercel', state: 'success' }] }) })]) {
    assert.equal(await observeNewsDeployment({ mergeSha, proposed: result.proposed, run, fetchLive: async () => { throw new Error('unexpected'); } }), 'UNCONFIRMED');
  }
  const m = liveMock(result);
  assert.equal(await observeNewsDeployment({ mergeSha, proposed: result.proposed, run: m.run, fetchDeployment: m.fetchDeployment, fetchLive: async () => { throw new Error('timeout'); } }), 'UNCONFIRMED');
});
test('clean shadow CLI imports actual sync without env reads or remote/model writes', () => {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  const sourceSha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-shadow-test-'));
  const guard = path.join(cwd, 'guard.mjs');
  fs.writeFileSync(path.join(cwd, '.env.local'), 'not-an-environment-file');
  fs.writeFileSync(guard, `import fs from 'node:fs'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
    const read=fs.readFileSync, exec=cp.execFileSync; globalThis.fetch=()=>{throw new Error('network forbidden')};
    fs.readFileSync=(p,...a)=>{if(String(p).includes('.env'))throw new Error('env read forbidden');return read(p,...a)};
    cp.execFileSync=(cmd,args,...a)=>{if(cmd!=='git'||!['rev-parse','show'].some(v=>args.includes(v)))throw new Error('write/tool forbidden');return exec(cmd,args,...a)};
    syncBuiltinESMExports();`);
  let scratch;
  try {
    const cli = fileURLToPath(new URL('./news-shadow.mjs', import.meta.url));
    scratch = execFileSync(process.execPath, ['--import', guard, cli, '--repo', repo, '--sha', sourceSha, '--now', '2026-11-06T20:00:00Z', '--slot', 'morning', '--run-id', 'clean-runner'], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } }).trim();
    const plan = JSON.parse(fs.readFileSync(path.join(scratch, 'plan.json')));
    assert.equal(plan.sourceSha, sourceSha); assert.equal(plan.mode, 'shadow');
    assert.equal(fs.readFileSync(path.join(cwd, '.env.local'), 'utf8'), 'not-an-environment-file');
    assert.equal(fs.statSync(scratch).mode & 0o777, 0o700);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); if (scratch) fs.rmSync(scratch, { recursive: true, force: true }); }
});

test('RSS source timeout aborts without translation or writes', async () => {
  const keepAlive = setTimeout(() => {}, 100);
  let translated = false;
  try {
    await assert.rejects(runNewsSync({ previous: { items: [] }, rssTimeoutMs: 5,
      translate: async () => { translated = true; },
      fetchImpl: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))),
    }), /timeout/);
    assert.equal(translated, false);
  } finally { clearTimeout(keepAlive); }
});

test('scratch under repository is rejected and explicit required checks are enforced', async () => {
  const result = await prepare();
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  assert.throws(() => writeShadowArtifacts(result, { scratchRoot: repo, repoPath: repo }), /outside repo/);
  let merged = false;
  await assert.rejects(mergeVerifiedNewsPr({ prNumber: 1, expectedHead: head, write: true, requiredChecks: ['validate', 'gitleaks'], run: async (_, args) => {
    if (args[1] === 'merge') { merged = true; throw new Error('forbidden'); }
    return { code: 0, stdout: JSON.stringify(args[1] === 'checks' ? [{ name: 'validate', state: 'SUCCESS', bucket: 'pass' }] : { headRefOid: head, state: 'OPEN', baseRefName: 'main', isDraft: false, files: [{ path: 'data/news.json' }] }) };
  } }), /required check/);
  assert.equal(merged, false);
});

test('manual publish CLI parses explicit epoch and reconcile independently and defaults disabled', () => {
  assert.throws(() => parsePublishOptions([]), /disabled/);
  assert.throws(() => parsePublishOptions(['--publish', 'true', '--production-enable', 'true', '--reconcile-existing', 'true']), /disabled/);
  const base = ['--repo', '/fixture/repo', '--plan-dir', '/fixture/plan', '--publish', 'true', '--production-enable', 'true', '--owner-epoch', 'epoch-1'];
  assert.deepEqual(parsePublishOptions(base), { repoPath: '/fixture/repo', artifactDir: '/fixture/plan', ownerEpoch: 'epoch-1', reconcileExisting: false });
  assert.equal(parsePublishOptions([...base, '--reconcile-existing', 'true']).reconcileExisting, true);
  assert.equal(parsePublishOptions([...base, '--reconcile-existing', 'true']).ownerEpoch, 'epoch-1');
});
