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
import { publishPortableNews, observeNewsDeployment, observeNewsDeploymentDetailed } from './news-publish.mjs';
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
  const pr = { headRefOid: head, state: 'OPEN', baseRefName: 'main', isDraft: false, commits: [{ authors: [{ email: 'opencard@opencardai.com' }] }], files: [{ path: 'data/news.json' }] };
  await assert.rejects(mergeVerifiedNewsPr({ prNumber: 1, expectedHead: head, write: true, run: async (_, args) => {
    if (args[1] === 'merge') { merged = true; throw new Error('must not merge'); }
    if (args[1] === 'checks') return { code: 0, stdout: JSON.stringify([{ name: 'validate', state: ++checks === 1 ? 'SUCCESS' : 'PENDING', bucket: checks === 1 ? 'pass' : 'pending' }]) };
    return { code: 0, stdout: JSON.stringify(pr) };
  } }), /checks/);
  assert.equal(checks, 2); assert.equal(merged, false);
});

function liveMock(result, options = {}) {
  const calls = [], scratch = [];
  let creationLists = 0, ownerReads = 0;
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
      if (args.includes('ls-remote')) return ok(options.orphan ? 'remote-head' : '');
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
      if (args.includes('all')) return ok(options.existingPrs ?? (options.existing ? [{ number: 7, state: 'OPEN', headRefOid: head }] : []));
      if (!args.includes('--head')) return ok((options.open ?? []).map(p => Object.fromEntries(args.at(-1).split(',').map(field => [field, p[field]]))));
      return ok(++creationLists >= (options.creationLag ?? 1) ? [{ number: 7 }] : []);
    }
    if (args[1] === 'create') return ok(options.createdUrl ?? '');
    if (args[1] === 'view' && args.at(-1) === 'number,headRefName,baseRefName,isDraft,isCrossRepository,author,files,commits,headRefOid,state') return ok((options.preflightPrs ?? options.open ?? []).find(p => String(p.number) === args[2]));
    if (args[1] === 'view' && args.at(-1) === 'headRefOid,files,state,commits') { const p = (options.open ?? []).find(x => String(x.number) === args[2]); return ok(options.changedBeforeClose ? { ...p, commits: [...p.commits, p.commits[0]] } : p); }
    if (args[1] === 'view' && args.at(-1) === 'state') return ok({ state: options.closeUnconfirmed ? 'OPEN' : 'CLOSED' });
    if (args[1] === 'checks') return ok(['validate', 'gitleaks'].map(name => ({ name, bucket: options.pending ? 'pending' : 'pass', state: options.pending ? 'PENDING' : 'SUCCESS' })));
    if (args[1] === 'view') return ok(args.at(-1) === 'state,mergeCommit' ? { state: 'MERGED', mergeCommit: { oid: mergeSha } } : { headRefOid: head, state: 'OPEN', baseRefName: 'main', isDraft: false, commits: [{ authors: [{ email: 'opencard@opencardai.com' }] }], files: [{ path: 'data/news.json' }] });
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
  assert.equal(await observeNewsDeployment({ mergeSha, proposed: result.proposed, run: m.run, fetchDeployment: m.fetchDeployment, fetchLive: async () => { throw new Error('timeout'); }, timeoutMs: 1, pollMs: 1, sleep: async () => {} }), 'UNCONFIRMED');
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
    return { code: 0, stdout: JSON.stringify(args[1] === 'checks' ? [{ name: 'validate', state: 'SUCCESS', bucket: 'pass' }] : { headRefOid: head, state: 'OPEN', baseRefName: 'main', isDraft: false, commits: [{ authors: [{ email: 'opencard@opencardai.com' }] }], files: [{ path: 'data/news.json' }] }) };
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

const botCommit = { authors: [{ email: 'opencard@opencardai.com' }] };
const eligibleStale = { number: 21, headRefName: `bot/news-sync/${'d'.repeat(24)}`, headRefOid: head,
  state: 'OPEN', baseRefName: 'main', isDraft: false, isCrossRepository: false,
  author: { login: 'opencard-ai' }, files: [{ path: 'data/news.json' }], commits: [botCommit] };
const publishMock = (result, m, extra = {}) => publishPortableNews({ ...result, ...m, repoPath: '/fixture/repo',
  publish: true, productionEnable: true, ownerEpoch: 'fixture-epoch', sleep: async () => {}, ...extra });

test('eligible stale PRs are closed, branch deleted, and regenerated news proceeds; same-slot open also superseded', async () => {
  const result = await prepare();
  for (const sameSlot of [false, true]) {
    const stale = { ...eligibleStale, headRefName: sameSlot ? `bot/news-sync/${jsonHash(result.plan.slotKey).slice(0, 24)}` : eligibleStale.headRefName };
    const m = liveMock(result, { open: [stale], existingPrs: sameSlot ? [stale] : [] });
    const receipt = await publishMock(result, m);
    assert.deepEqual(receipt.superseded, [21]);
    assert.equal(receipt.state, 'MERGED');
    const list = m.calls.find(c => c[2] === 'list' && !c.includes('--head'));
    assert.equal(list[list.indexOf('--limit') + 1], '1000');
    assert.deepEqual(list.at(-1).split(','), ['number', 'headRefName', 'baseRefName', 'isDraft', 'isCrossRepository', 'author', 'headRefOid', 'state']);
    const closeAt = m.calls.findIndex(c => c[2] === 'close');
    const close = m.calls[closeAt];
    assert.ok(close.includes('--delete-branch'));
    assert.equal(close[3], '21');
    assert.match(close.at(-1), new RegExp(`Superseded by slot ${result.plan.slotKey}`));
    assert.match(close.at(-1), /current main; no content lost/);
    assert.ok(m.calls[closeAt - 2][2].includes('ops/runner-owner.json'));
    assert.ok(m.calls[closeAt - 1][2].includes('git/ref/heads/main'));
    assert.equal(m.calls[closeAt - 3].at(-1), 'headRefOid,files,state,commits');
    assert.ok(m.calls.findIndex(c => c[2] === 'view' && c.at(-1).startsWith('number,headRefName,')) < closeAt - 3);
    assert.equal(m.calls[closeAt + 1].at(-1), 'state');
    assert.ok(m.calls.findIndex(c => c[2] === 'create') > closeAt);
    assert.equal(m.calls.some(c => c[2] === 'merge' && c[3] === '21'), false);
  }
});

test('preflight uses per-PR files, commits and author email and reads only news candidates', async () => {
  const result = await prepare();
  for (const change of [
    { files: [{ path: 'README.md' }] }, { files: undefined },
    { commits: [botCommit, botCommit] }, { commits: undefined },
    { commits: [{ authors: [{ email: 'other@example.test' }] }] },
  ]) {
    const m = liveMock(result, { open: [eligibleStale], preflightPrs: [{ ...eligibleStale, ...change }] });
    await assert.rejects(publishMock(result, m), e => e.reason === 'stale_pr_not_supersedable');
    assert.equal(m.calls.some(c => ['close', 'create', 'merge'].includes(c[2]) || c.includes('push')), false);
    assert.equal(m.calls.filter(c => c[2] === 'view').length, 1);
  }
  const m = liveMock(result, { open: [eligibleStale, { number: 99, headRefName: 'feature/unrelated' }] });
  assert.equal((await publishMock(result, m)).state, 'MERGED');
  assert.equal(m.calls.some(c => c[2] === 'view' && c[3] === '99'), false);
});

test('preflight rejects any ineligible stale PR or four PRs before closing or writing anything', async () => {
  const result = await prepare();
  const invalid = [
    { commits: [botCommit, botCommit] }, { commits: [{ authors: [{ email: 'other@example.test' }] }] },
    { files: [{ path: 'data/news.json' }, { path: 'README.md' }] }, { author: { login: 'someone' } },
    { headRefName: 'bot/news-sync/unexpected' }, { baseRefName: 'other' }, { isDraft: true },
    { isCrossRepository: true }, { state: 'CLOSED' }, { commits: undefined },
  ].map(change => [eligibleStale, { ...eligibleStale, number: 22, ...change }]);
  invalid.push(Array.from({ length: 4 }, (_, i) => ({ ...eligibleStale, number: 21 + i })));
  for (const open of invalid) {
    const m = liveMock(result, { open });
    await assert.rejects(publishMock(result, m), e => e.reason === 'stale_pr_not_supersedable');
    assert.equal(m.calls.some(c => ['close', 'create', 'merge'].includes(c[2]) || c.includes('push') || c.includes('add')), false);
  }
  const m = liveMock(result, { open: [eligibleStale] });
  await assert.rejects(publishMock(result, m, { reconcileExisting: true }), e => e.reason === 'another_news_pr_blocking');
  assert.equal(m.calls.some(c => c[2] === 'close'), false);
});

test('superseding stops if the stale PR gains a commit between list and close', async () => {
  const result = await prepare();
  const m = liveMock(result, { open: [eligibleStale], changedBeforeClose: true });
  await assert.rejects(publishMock(result, m), e => e.reason === 'stale_pr_not_supersedable');
  assert.equal(m.calls.some(c => c[2] === 'close' || c[2] === 'create' || c.includes('push')), false);
});

test('superseding stops if authority changes or the close receipt is not CLOSED', async () => {
  const result = await prepare();
  const m = liveMock(result, { open: [eligibleStale], closeUnconfirmed: true });
  await assert.rejects(publishMock(result, m), e => e.reason === 'stale_pr_not_supersedable');
  assert.equal(m.calls.some(c => c[2] === 'create' || c.includes('push')), false);
  const revoked = liveMock(result, { open: [eligibleStale] });
  const run = async (cmd, args) => {
    if (cmd === 'gh' && args[0] === 'api' && args[1].includes('ops/runner-owner') && revoked.calls.some(c => c[2] === 'list')) {
      return { code: 0, stdout: JSON.stringify({ content: Buffer.from('{}').toString('base64') }) };
    }
    return revoked.run(cmd, args);
  };
  await assert.rejects(publishMock(result, { ...revoked, run }), e => e.reason === 'owner_denied');
  assert.equal(revoked.calls.some(c => c[2] === 'close'), false);
});

test('same-slot merged is a success no-op; closed PR with deleted branch is ignored; orphan still blocks', async () => {
  const result = await prepare();
  for (const existingPrs of [[{ number: 7, state: 'MERGED' }], [{ number: 6, state: 'CLOSED' }, { number: 7, state: 'MERGED' }]]) {
    const m = liveMock(result, { existingPrs });
    const receipt = await publishMock(result, m);
    assert.equal(receipt.state, 'SLOT_ALREADY_PUBLISHED');
    assert.equal(m.calls.some(c => ['close', 'create', 'merge'].includes(c[2]) || c.includes('push')), false);
  }
  const m = liveMock(result, { existingPrs: [{ number: 6, state: 'CLOSED' }] });
  assert.equal((await publishMock(result, m)).state, 'MERGED');
  const orphan = liveMock(result, { orphan: true });
  await assert.rejects(publishMock(result, orphan), e => e.reason === 'orphan_branch');
  assert.equal(orphan.calls.some(c => c.includes('push')), false);
  const closedOrphan = liveMock(result, { existingPrs: [{ number: 6, state: 'CLOSED' }], orphan: true });
  assert.equal((await publishMock(result, closedOrphan)).state, 'EXISTING_PR_RECONCILE');
  const resume = liveMock(result, { existingPrs: [{ number: 6, state: 'CLOSED' }, { number: 7, state: 'OPEN', headRefOid: head }] });
  assert.equal((await publishMock(result, resume, { reconcileExisting: true })).state, 'MERGED');
  assert.equal(resume.calls.some(c => ['close', 'create'].includes(c[2])), false);
  const wrongPayload = liveMock(result, { existing: true });
  const run = async (cmd, args) => args[1]?.includes('contents/data/news.json')
    ? { code: 0, stdout: JSON.stringify({ content: Buffer.from('{"items":[]}').toString('base64') }) }
    : wrongPayload.run(cmd, args);
  await assert.rejects(publishMock(result, { ...wrongPayload, run }, { reconcileExisting: true }), e => e.reason === 'payload_changed');
});

test('PR creation uses only a validated URL or bounded eventually-consistent head listing; body states exact merge policy', async () => {
  const result = await prepare();
  for (const options of [{ createdUrl: 'https://github.com/opencard-ai/opencard/pull/7' }, { creationLag: 3 },
    { createdUrl: 'https://github.com/other/repo/pull/7', creationLag: 2 }]) {
    const m = liveMock(result, options), sleeps = [];
    const receipt = await publishMock(result, m, { sleep: async ms => sleeps.push(ms) });
    assert.equal(receipt.state, 'MERGED');
    assert.equal(sleeps.length, (options.creationLag ?? 1) - 1);
    assert.ok(sleeps.every(ms => ms === 2000));
    if (!options.creationLag) assert.equal(m.calls.filter(c => c[2] === 'list').length, 2);
    const create = m.calls.find(c => c[2] === 'create');
    assert.equal(create.at(-1), `Automated news sync for slot ${result.plan.slotKey}. Changes only data/news.json. Auto-merges only when the PR has exactly 1 commit, touches only data/news.json, and the required checks (validate, gitleaks) pass; otherwise it is left open for review (a later scheduled run may close an untouched, unmerged bot news PR as superseded).`);
  }
  const m = liveMock(result, { creationLag: 9 }), sleeps = [];
  await assert.rejects(publishMock(result, m, { sleep: async ms => sleeps.push(ms) }), e => e.reason === 'pr_creation_unconfirmed');
  assert.equal(sleeps.length, 4);
  assert.equal(m.calls.some(c => c[2] === 'merge'), false);
});

test('superseded identities survive pending checks for the workflow summary', async () => {
  const result = await prepare(), m = liveMock(result, { open: [eligibleStale], pending: true });
  await assert.rejects(publishMock(result, m), e => e.code === 'CHECKS_PENDING' && e.superseded[0] === 21);
});

test('observer allows 130s deployments, retries all transient readers, and times out at eight minutes', async () => {
  const proposed = { items: [], fetched: 'fixed' };
  const ready = { name: 'opencard', target: 'production', meta: { githubCommitSha: mergeSha }, readyState: 'READY' };
  const goodStatus = { code: 0, stdout: JSON.stringify({ sha: mergeSha, statuses: [{ context: 'Vercel', state: 'success' }] }) };
  for (const flaky of ['slow', 'gh_exit', 'gh_throw', 'deployment', 'live', 'timeout']) {
    let clock = 0, reads = 0;
    const opts = { mergeSha, proposed, now: () => clock, sleep: async ms => { clock += ms; },
      run: async () => {
        reads++;
        if (reads === 1 && flaky === 'gh_exit') return { code: 1, stdout: '' };
        if (reads === 1 && flaky === 'gh_throw') throw new Error('synthetic-private');
        return goodStatus;
      },
      fetchDeployment: async () => {
        if (clock === 0 && flaky === 'deployment') throw new Error('synthetic-private');
        return flaky === 'timeout' || (flaky === 'slow' && clock < 130000) ? [] : [ready];
      },
      fetchLive: async () => {
        if (clock === 0 && flaky === 'live') throw new Error('synthetic-private');
        return { status: 200, data: proposed };
      },
    };
    const evidence = await observeNewsDeploymentDetailed(opts);
    assert.equal(evidence.status, flaky === 'timeout' ? 'UNCONFIRMED' : 'VERIFIED');
    assert.equal(evidence.reason, flaky === 'timeout' ? 'timeout' : 'verified');
    assert.ok(evidence.attempts > 1);
    assert.equal(clock, flaky === 'timeout' ? 480000 : flaky === 'slow' ? 130000 : 10000);
  }
  for (const state of ['failure', 'error']) {
    const evidence = await observeNewsDeploymentDetailed({ mergeSha, proposed,
      run: async () => ({ code: 0, stdout: JSON.stringify({ sha: mergeSha, statuses: [{ context: 'Vercel', state }] }) }),
      fetchDeployment: async () => { throw new Error('must not read'); },
      sleep: async () => { throw new Error('must not wait'); },
    });
    assert.deepEqual(evidence, { status: 'UNCONFIRMED', reason: 'deployment_failed', attempts: 1 });
  }
  assert.deepEqual(await observeNewsDeploymentDetailed({ mergeSha: 'bad' }), { status: 'UNCONFIRMED', reason: 'invalid_sha', attempts: 0 });
});
