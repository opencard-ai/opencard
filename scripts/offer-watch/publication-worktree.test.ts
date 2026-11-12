/** Real temporary Git repos/worktrees; EVERY GitHub/Vercel/remote Git operation is mocked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runSandboxDaily } from './daily';
import { redisSandboxState } from './sandbox-state';
import { createRedisOfferState } from './redis-state';
import { emptyLedger } from './gate';
const FILE = 'data/cards/fixture-card.json';
import { createAcceptanceFixture as harness } from './acceptance-fixture';
test('real Git daily stages publish planned bytes; artifacts external, ignored/untracked artifact content never enters tree; same-slot resume no republish', async () => {
  const h = harness(); try {
    const a = h.make('first'); const result = await runSandboxDaily(a.options); assert.equal(result.result.status, 'published');
    assert.deepEqual(h.writes, ['push', 'create', 'merge']);
    assert.ok(fs.statSync(path.join(a.repo, '.git')).isFile(), 'publication uses a real linked Git worktree');
    for (const name of ['candidates.json', 'review.json', 'apply.json']) assert.ok(fs.existsSync(path.join(a.io.artifactRoot, name)), name);
    assert.ok(fs.existsSync(path.join(a.io.artifactRoot, 'candidates.json'))); assert.ok(!fs.existsSync(path.join(a.repo, 'artifacts')));
    fs.mkdirSync(path.join(a.io.artifactRoot, 'ignored-artifact')); fs.writeFileSync(path.join(a.io.artifactRoot, 'ignored-artifact', 'fixture'), 'external only'); fs.writeFileSync(path.join(a.io.artifactRoot, 'untracked.fixture'), 'external only');
    assert.equal(a.must(['status', '--porcelain', '--untracked-files=all']), '');
    assert.deepEqual(a.must(['diff', '--name-only', 'HEAD^', 'HEAD']).split('\n'), [FILE]);
    const b = h.make('retry'); assert.equal((await runSandboxDaily(b.options)).result.status, 'published'); assert.deepEqual(h.writes, ['push', 'create', 'merge']); assert.equal(h.fetches(), 2);
  } finally { h.close(); }
});
for (const kind of ['dirty-source', 'staged-source', 'untracked-input'] as const) test(`real Git existing-PR resume refuses ${kind} before merge, releases lease and can recover`, async () => {
  const h = harness(); try {
    h.checks(true); const a = h.make('open'); assert.equal((await runSandboxDaily(a.options)).result.status, 'uncertain'); assert.deepEqual(h.writes, ['push', 'create']);
    h.checks(false); const b = h.make('dirty');
    if (kind === 'untracked-input') fs.writeFileSync(path.join(b.repo, 'unexpected.ts'), 'unvalidated');
    else { fs.writeFileSync(path.join(b.repo, 'src/app.ts'), 'export const fixture = false;\n'); if (kind === 'staged-source') { b.must(['add', 'src/app.ts']); fs.writeFileSync(path.join(b.repo, 'src/app.ts'), 'export const fixture = true;\n'); } }
    await assert.rejects(runSandboxDaily(b.options)); assert.deepEqual(h.writes, ['push', 'create']);
    const c = h.make('recovered'); assert.equal((await runSandboxDaily(c.options)).result.status, 'published'); assert.deepEqual(h.writes, ['push', 'create', 'merge']);
  } finally { h.close(); }
});
test('real Git mutation after checks but before existing-PR merge is caught at authority boundary', async () => {
  const h = harness(); try {
    h.checks(true); await runSandboxDaily(h.make('open').options); h.checks(false); const b = h.make('resume');
    h.hook(() => fs.writeFileSync(path.join(b.repo, 'src/app.ts'), 'mutated after validation'));
    assert.equal((await runSandboxDaily(b.options)).result.status, 'uncertain'); assert.deepEqual(h.writes, ['push', 'create']);
  } finally { h.close(); }
});
test('real Git planned bytes changed during stage cannot be committed or pushed', async () => {
  const h = harness(); try {
    const a = h.make('stage-change'), original = a.options.publisher.run;
    a.options.publisher.run = (cmd, args) => { const r = original(cmd, args); if (cmd === 'git' && args[0] === 'add') { fs.writeFileSync(path.join(a.repo, FILE), '{}'); a.must(['add', '--', FILE]); } return r; };
    assert.equal((await runSandboxDaily(a.options)).result.status, 'precondition_failed'); assert.deepEqual(h.writes, []); assert.equal(a.must(['rev-list', '--count', 'HEAD']), '1');
  } finally { h.close(); }
});
test('real Git existing PR with altered noncard remote tree is rejected, no merge', async () => {
  const h = harness(); try { h.checks(true); await runSandboxDaily(h.make('open').options); h.checks(false); h.corruptRemote(); assert.equal((await runSandboxDaily(h.make('resume').options)).result.status, 'uncertain'); assert.deepEqual(h.writes, ['push', 'create']); } finally { h.close(); }
});
test('external artifacts root inside publication tree is refused rather than allowlisted', () => {
  const h = harness(); try { const a = h.make('root-check'); assert.throws(() => redisSandboxState({ enabled: true, state: createRedisOfferState({ enabled: true, prefix: 'opencard:offer-state:{sandbox-rootcheck01}:', transport: h.db.transport, runnerId: 'rootcheck', ttlMs: 60000 }), scratch: a.repo, artifacts: path.join(a.repo, 'artifacts'), cards: new Map(), seed: { schema: 1, ledger: emptyLedger(), history: [], daily: {} } }), /artifacts/); } finally { h.close(); }
});

test('real Git rollback binds actual revert tree before mocked PR push/merge; restores exact original card bytes', async () => {
  const h = harness(); try { const a = h.make('rollback'); let observations = 0; a.options.fetchDeployments = async sha => [{ created: 1, name: 'opencard', target: 'production', readyState: ++observations === 1 ? 'ERROR' : 'READY', meta: { githubCommitSha: sha } }];
    const outcome = await runSandboxDaily(a.options); assert.equal(outcome.result.status, 'deploy_failed'); assert.deepEqual(h.writes, ['push', 'create', 'merge', 'push', 'create', 'merge']); assert.equal(JSON.parse(fs.readFileSync(path.join(a.repo, FILE), 'utf8')).welcome_offer.bonus_points, 10000); assert.equal(a.must(['status', '--porcelain']), '');
  } finally { h.close(); }
});
test('real Git rollback with dirty application source after revert is UNCERTAIN and never pushes revert', async () => {
  const h = harness(); try { const a = h.make('dirty-revert'), original = a.options.publisher.run; a.options.publisher.run = (cmd, args) => { const r = original(cmd, args); if (cmd === 'git' && args.includes('revert')) fs.writeFileSync(path.join(a.repo, 'src/app.ts'), 'unvalidated revert input'); return r; }; a.options.fetchDeployments = async sha => [{ created: 1, name: 'opencard', target: 'production', readyState: 'ERROR', meta: { githubCommitSha: sha } }];
    assert.equal((await runSandboxDaily(a.options)).result.status, 'uncertain'); assert.deepEqual(h.writes, ['push', 'create', 'merge']);
  } finally { h.close(); }
});

test('real Git existing PR merge refuses authoritative main changed after validation/checks', async () => {
  const h = harness(); try { h.checks(true); await runSandboxDaily(h.make('open').options); h.checks(false); const a = h.make('main-changed'); h.hook(h.moveMain); assert.equal((await runSandboxDaily(a.options)).result.status, 'uncertain'); assert.deepEqual(h.writes, ['push', 'create']); } finally { h.close(); }
});

test('Codex followup: two pretty baseline cards preserve unchanged bytes through real apply and fresh-worktree resume', async () => {
  const h = harness({ prettyMulti: true }); try { const a = h.make('pretty'), file = 'data/cards/unchanged-card.json', before = fs.readFileSync(path.join(a.repo, file));
    assert.equal((await runSandboxDaily(a.options)).result.status, 'published'); assert.deepEqual(fs.readFileSync(path.join(a.repo, file)), before); assert.deepEqual(a.must(['diff', '--name-only', 'HEAD^', 'HEAD']).split('\n'), [FILE]);
    const b = h.make('pretty-resume'); assert.equal((await runSandboxDaily(b.options)).result.status, 'published'); assert.deepEqual(fs.readFileSync(path.join(b.repo, file)), before); assert.deepEqual(h.writes, ['push', 'create', 'merge']);
  } finally { h.close(); }
});
test('Codex followup: real async npm fixture validate/build writes only external private home/cache, cleans up and passes tree binding', async () => {
  const { asyncOfferCheck } = await import('./async-check'); const h = harness({ prettyMulti: true, checker: true }); try { const a = h.make('actual-check');
    a.options.asyncRun = (cmd, args, signal, context) => asyncOfferCheck(cmd, args, signal, { cwd: context.cwd, timeoutMs: 30000 });
    a.options.config.checks = [['npm', 'run', 'validate'], ['npm', 'run', 'build']];
    assert.equal((await runSandboxDaily(a.options)).result.status, 'published'); assert.equal(a.must(['status', '--porcelain', '--untracked-files=all']), ''); assert.equal(fs.existsSync(path.join(a.repo, '.check-home')), false);
    const receipt = JSON.parse(fs.readFileSync(path.join(a.repo, '..', 'checker-receipt.json'), 'utf8')); assert.ok(!receipt.home.startsWith(a.repo + path.sep)); assert.ok(receipt.cache.startsWith(receipt.home + path.sep)); assert.ok(receipt.temp.startsWith(receipt.home + path.sep)); assert.equal(fs.existsSync(receipt.home), false);
  } finally { h.close(); }
});
