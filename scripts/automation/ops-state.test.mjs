import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { decideMode } from '../ops-state/owner.mjs';
import { pull } from '../ops-state/pull.mjs';
import { commitState, gitRunner, concurrentChangeIsSafe } from '../ops-state/commit.mjs';
import { sha256, offerFiles, incoming, manifestAt } from '../ops-state/core.mjs';
const identity = { GIT_AUTHOR_NAME: 'Synthetic fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com', GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com' };
const botIdentity = { GIT_AUTHOR_NAME: 'github-actions[bot]', GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com', GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com' };
function temp(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-state-test-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }
function write(d, p, b) { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), b); }
function snapshot(d) {
  const files = [...offerFiles.map(n => [`offer-watch/${n}`, n.endsWith('.jsonl') ? '' : '{}']), ['audit/2026-11-09-db-audit.json', '{"findings":[]}']];
  for (const [p, b] of files) write(d, p, b);
  const manifest = { version: 1, custom: 'keep', runs: { audit: { last_run_id: '90' } }, files: files.map(([p, b]) => ({ path: p, sha256: sha256(b), size: Buffer.byteLength(b), mac_sha256: 'synthetic', source: 'synthetic', modified: false, urls_stripped: 0 })) };
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  write(d, 'MANIFEST.json', JSON.stringify(manifest)); return manifest;
}
for (const job of ['offer', 'audit', 'gsc']) test(`owner matrix: ${job}`, () => {
  const base = { ownerDoc: { version: 1, [job]: { owner: 'github-actions', productionEnabled: true, epoch: 'test-1' } }, job, expectedEpoch: 'test-1', eventName: 'schedule', ref: 'refs/heads/main' };
  assert.equal(decideMode(base).mode, 'write');
  for (const eventName of ['pull_request', 'pull_request_target', undefined]) assert.equal(decideMode({ ...base, eventName }).mode, 'shadow');
  for (const patch of [{ ref: 'refs/heads/topic' }, { expectedEpoch: 'old' }, { expectedEpoch: undefined }, { ownerDoc: null }, { ownerDoc: {} }, { job: 'news' }]) assert.equal(decideMode({ ...base, ...patch }).mode, 'shadow');
  for (const patch of [{ owner: 'mac' }, { productionEnabled: false }, { epoch: 'old' }]) assert.equal(decideMode({ ...base, ownerDoc: { version: 1, [job]: { ...base.ownerDoc[job], ...patch } } }).mode, 'shadow');
  assert.equal(decideMode({ ...base, ownerDoc: { ...base.ownerDoc, version: 2 } }).mode, 'shadow');
  assert.equal(decideMode({ ...base, eventName: 'workflow_dispatch' }).mode, 'write');
});
test('owner CLI parse error is shadow and emits safe outputs', t => {
  const d = temp(t); write(d, 'bad.json', '{');
  const r = spawnSync(process.execPath, ['scripts/ops-state/owner.mjs', '--file', path.join(d, 'bad.json')], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: path.join(d, 'output') } });
  assert.ifError(r.error); assert.equal(r.status, 0); assert.equal(r.stdout.trim(), 'shadow', JSON.stringify(r)); assert.match(fs.readFileSync(path.join(d, 'output'), 'utf8'), /mode=shadow\nreason=/);
});
test('pull copies only allowlisted state, audit strictly before today', t => {
  const d = temp(t), src = path.join(d, 'src'); const m = snapshot(src);
  write(src, 'audit/2026-11-15-db-audit.json', '{}'); m.files.push({ path: 'audit/2026-11-15-db-audit.json', size: 2, sha256: sha256('{}') });
  write(src, 'MANIFEST.json', JSON.stringify(m)); write(src, 'offer-watch/unlisted.json', '{}');
  pull({ src, job: 'offer', out: path.join(d, 'offer') }); assert.deepEqual(fs.readdirSync(path.join(d, 'offer')).sort(), [...offerFiles].sort());
  pull({ src, job: 'audit', today: '2026-11-15', out: path.join(d, 'audit') }); assert.deepEqual(fs.readdirSync(path.join(d, 'audit')), ['2026-11-09-db-audit.json']);
});
for (const mode of ['manifest-link', 'parent-link', 'file-link', 'traversal', 'sha', 'size', 'missing', 'empty', 'duplicate', 'bad-json', 'missing-offer']) test(`pull refuses ${mode}`, t => {
  const d = temp(t), src = path.join(d, 'src'), m = snapshot(src);
  if (mode === 'manifest-link') { fs.renameSync(path.join(src, 'MANIFEST.json'), path.join(d, 'real')); fs.symlinkSync(path.join(d, 'real'), path.join(src, 'MANIFEST.json')); }
  else if (mode === 'parent-link') { fs.renameSync(path.join(src, 'offer-watch'), path.join(d, 'real')); fs.symlinkSync(path.join(d, 'real'), path.join(src, 'offer-watch')); }
  else if (mode === 'file-link') { fs.renameSync(path.join(src, 'offer-watch/ledger.json'), path.join(d, 'real')); fs.symlinkSync(path.join(d, 'real'), path.join(src, 'offer-watch/ledger.json')); }
  else {
    if (mode === 'traversal') m.files[0].path = 'audit/../../escape';
    if (mode === 'sha') m.files[0].sha256 = 'bad';
    if (mode === 'size') m.files[0].size++;
    if (mode === 'missing') fs.unlinkSync(path.join(src, m.files[0].path));
    if (mode === 'empty') m.files = [];
    if (mode === 'duplicate') m.files.push(m.files[0]);
    if (mode === 'missing-offer') m.files = m.files.filter(f => f.path !== 'offer-watch/ledger.json');
    write(src, 'MANIFEST.json', mode === 'bad-json' ? '{' : JSON.stringify(m));
  }
  assert.throws(() => pull({ src, job: 'offer', out: path.join(d, 'out') })); assert.equal(fs.existsSync(path.join(d, 'out')), false);
});
function repoFixture(t, configureManifest) {
  const d = temp(t), origin = path.join(d, 'origin.git'), repo = path.join(d, 'repo'), from = path.join(d, 'incoming');
  fs.mkdirSync(repo); gitRunner(d, ['init', '--bare', origin]); gitRunner(repo, ['init', '-b', 'ops-state']); snapshot(repo);
  if (configureManifest) {
    const m = manifestAt(repo); configureManifest(m);
    write(repo, 'MANIFEST.json', JSON.stringify(m));
  }
  gitRunner(repo, ['add', '.']); gitRunner(repo, ['commit', '-m', 'synthetic seed'], identity);
  gitRunner(repo, ['remote', 'add', 'origin', origin]); gitRunner(repo, ['push', 'origin', 'HEAD:refs/heads/ops-state']);
  for (const n of offerFiles) write(from, n, n.endsWith('.jsonl') ? '{"type":"held"}\n' : n === 'ledger.json' ? '{"entries":{}}' : '{}');
  const base = gitRunner(repo, ['rev-parse', 'HEAD']);
  const calls = [], runner = (r, argv, env) => { calls.push(argv); return gitRunner(r, argv, env); };
  t.after(() => { for (const call of calls) for (const arg of call) { assert.notEqual(arg, '--force'); assert.notEqual(arg, '-f'); assert.ok(!arg.startsWith('+')); } });
  return { d, origin, repo, from, base, calls, runner, a: { repo, from, job: 'offer', 'run-id': '123', attempt: '1', 'pt-date': '2026-11-15', epoch: 'offer-test', 'base-sha': base } };
}
test('commit fast-forward, manifest metadata, bot identity, exact message, idempotent rerun', t => {
  const f = repoFixture(t); const r = commitState(f.a, f.runner); assert.equal(r.committed, true);
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), r.commit_sha);
  assert.equal(gitRunner(f.repo, ['log', '-1', '--format=%s']), 'state(offer-watch): 2026-11-15 run 123 attempt 1');
  assert.equal(gitRunner(f.repo, ['log', '-1', '--format=%an <%ae>|%cn <%ce>']), 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>|github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>');
  const m = JSON.parse(fs.readFileSync(path.join(f.repo, 'MANIFEST.json')));
  assert.equal(m.custom, 'keep'); assert.equal(m.runs.audit.last_run_id, '90'); assert.equal(m.runs.offer.base_sha, f.base);
  assert.equal(m.files.find(f => f.path === 'offer-watch/ledger.json').source, undefined);
  assert.equal(m.files.find(f => f.path === 'offer-watch/daily-state.json').source, 'synthetic');
  assert.deepEqual(m.files.map(f => f.path), m.files.map(f => f.path).sort());
  const before = gitRunner(f.repo, ['rev-list', '--count', 'HEAD']);
  const again = commitState({ ...f.a, attempt: '2', 'base-sha': r.commit_sha }, f.runner);
  assert.equal(again.skipped, true); assert.equal(gitRunner(f.repo, ['rev-list', '--count', 'HEAD']), before);
  const callsBefore = f.calls.length;
  const staleBase = commitState({ ...f.a, attempt: '2' }, f.runner);
  assert.deepEqual(staleBase, { committed: false, skipped: true, commit_sha: r.commit_sha, rebased: false });
  assert.equal(f.calls.length, callsBefore + 1); // only HEAD, despite the old base SHA
  assert.equal(gitRunner(f.repo, ['rev-list', '--count', 'HEAD']), before);
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), r.commit_sha);

});
test('unchanged bytes still commit the run record', t => {
  const f = repoFixture(t); for (const n of offerFiles) fs.copyFileSync(path.join(f.repo, 'offer-watch', n), path.join(f.from, n));
  assert.equal(commitState(f.a, f.runner).committed, true);
});
test('base moved locally refuses before changes (exit 3)', t => {
  const f = repoFixture(t); assert.throws(() => commitState({ ...f.a, 'base-sha': '0'.repeat(40) }, f.runner), e => e.exitCode === 3);
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), f.base); assert.equal(gitRunner(f.repo, ['status', '--porcelain']), '');
});
test('concurrent origin writer causes non-ff failure (exit 4), no retry and origin unchanged', t => {
  const f = repoFixture(t), other = path.join(f.d, 'other'); gitRunner(f.d, ['clone', '--branch', 'ops-state', f.origin, other]);
  write(other, 'concurrent.txt', 'synthetic'); gitRunner(other, ['add', '.']); gitRunner(other, ['commit', '-m', 'other writer'], identity); gitRunner(other, ['push', 'origin', 'HEAD:refs/heads/ops-state']);
  const otherHead = gitRunner(other, ['rev-parse', 'HEAD']);
  assert.throws(() => commitState(f.a, f.runner), e => e.exitCode === 4 && /moved concurrently/.test(e.message));
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), otherHead);
  assert.equal(f.calls.filter(a => a[0] === 'push').length, 1);
});
for (const mode of ['bad-name', 'symlink', 'parent-symlink', 'bad-json', 'bad-jsonl', 'missing']) test(`commit refuses incoming ${mode} before changing repo`, t => {
  const f = repoFixture(t);
  if (mode === 'bad-name') write(f.from, 'notes.txt', 'synthetic');
  if (mode === 'bad-json') write(f.from, 'daily-state.json', '{');
  if (mode === 'bad-jsonl') write(f.from, 'history.jsonl', '{}\n{');
  if (mode === 'missing') fs.unlinkSync(path.join(f.from, 'ledger.json'));
  if (mode === 'symlink') { fs.unlinkSync(path.join(f.from, 'ledger.json')); fs.symlinkSync(path.join(f.repo, 'offer-watch/ledger.json'), path.join(f.from, 'ledger.json')); }
  if (mode === 'parent-symlink') { fs.renameSync(f.from, `${f.from}-real`); fs.symlinkSync(`${f.from}-real`, f.from); }
  assert.throws(() => commitState(f.a, f.runner)); assert.equal(gitRunner(f.repo, ['status', '--porcelain']), '');
});
test('audit allows only today report names, validates JSON and preserves historical reports', t => {
  const f = repoFixture(t); fs.rmSync(f.from, { recursive: true }); write(f.from, '2026-11-15-db-audit.json', '{"findings":[]}'); write(f.from, '2026-11-15-db-audit.md', 'synthetic');
  const a = { ...f.a, job: 'audit' }; assert.equal(commitState(a, f.runner).committed, true);
  assert.ok(fs.existsSync(path.join(f.repo, 'audit/2026-11-09-db-audit.json')));
  for (const [name, body] of [['2026-11-14-db-audit.json', '{}'], ['2026-11-15-notes.json', '{}'], ['2026-11-15-url-check.json', '{']]) {
    fs.rmSync(f.from, { recursive: true }); write(f.from, name, body);
    assert.throws(() => commitState({ ...a, 'run-id': '124', 'base-sha': gitRunner(f.repo, ['rev-parse', 'HEAD']) }, f.runner));
  }
});

test('pull CLI exits 2 for missing state', t => {
  const d = temp(t);
  const r = spawnSync(process.execPath, ['scripts/ops-state/pull.mjs', '--src', path.join(d, 'absent'), '--job', 'offer', '--out', path.join(d, 'out')], { encoding: 'utf8' });
  assert.ifError(r.error); assert.equal(r.status, 2, r.stderr);
});

test('injected git runner verifies state transformation, outputs, idempotency and push refusal without subprocesses', t => {
  const d = temp(t), repo = path.join(d, 'repo'), from = path.join(d, 'from'); snapshot(repo);
  for (const n of offerFiles) write(from, n, n.endsWith('.jsonl') ? '{"type":"held"}\n' : n === 'ledger.json' ? '{"entries":{}}' : '{}');
  const output = path.join(d, 'outputs');
  const originalOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  t.after(() => { if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = originalOutput; });
  const base = '1'.repeat(40), committed = '2'.repeat(40); let head = base, failPush = false;
  const calls = [];
  const git = (r, argv, env) => {
    assert.equal(r, repo); calls.push(argv);
    if (argv[0] === 'rev-parse') return head;
    if (argv[0] === 'status') return '';
    if (argv[0] === 'fetch') throw new Error('synthetic unavailable fetch');
    if (argv[0] === 'add') { assert.deepEqual(argv, ['add', '-A', 'offer-watch', 'audit', 'gsc', 'MANIFEST.json']); return ''; }
    if (argv[0] === 'commit') { assert.equal(env.GIT_COMMITTER_NAME, 'github-actions[bot]'); head = committed; return ''; }
    if (argv[0] === 'push') { assert.deepEqual(argv, ['push', 'origin', 'HEAD:refs/heads/ops-state']); if (failPush) throw new Error('synthetic non-ff https://user:token@example.invalid/repo http://other:secret@example.invalid/other'); return ''; }
    assert.fail(`unexpected git command ${argv}`);
  };
  const a = { repo, from, job: 'offer', 'run-id': '123', attempt: '1', 'pt-date': '2026-11-15', epoch: 'offer-test', 'base-sha': base };
  assert.equal(commitState(a, git).committed, true);
  const m = JSON.parse(fs.readFileSync(path.join(repo, 'MANIFEST.json')));
  assert.deepEqual(m.runs.offer, { last_run_id: '123', last_run_attempt: '1', pt_date: '2026-11-15', writer_epoch: 'offer-test', base_sha: base });
  assert.equal(m.runs.audit.last_run_id, '90'); assert.equal(m.custom, 'keep');
  assert.equal(m.files.find(f => f.path === 'offer-watch/ledger.json').mac_sha256, undefined);
  assert.equal(m.files.find(f => f.path === 'offer-watch/daily-state.json').mac_sha256, 'synthetic');
  assert.ok(fs.readFileSync(path.join(repo, 'MANIFEST.json'), 'utf8').endsWith('\n'));
  assert.match(fs.readFileSync(output, 'utf8'), /committed=true\nskipped=false\ncommit_sha=222/);
  const count = calls.length;
  assert.equal(commitState({ ...a, 'base-sha': committed }, git).skipped, true);
  assert.equal(calls.length, count + 1); // only HEAD, no staging/commit/push
  assert.equal(commitState(a, git).skipped, true); // successful push, rerun with old base
  assert.equal(calls.length, count + 2); // no additional commit or push
  assert.throws(() => commitState({ ...a, 'run-id': '124' }, git), e => e.exitCode === 3);
  failPush = true;
  const pushesBefore = calls.filter(argv => argv[0] === 'push').length;
  assert.throws(() => commitState({ ...a, 'base-sha': committed, 'run-id': '124' }, git), e => {
    assert.equal(e.exitCode, 4);
    assert.match(e.message, /synthetic non-ff example.invalid\/repo example.invalid\/other/);
    assert.doesNotMatch(e.message, /user:token|other:secret|https?:\/\//);
    return true;
  });
  assert.equal(calls.filter(argv => argv[0] === 'push').length, pushesBefore + 1);
  for (const argv of calls) for (const arg of argv) { assert.notEqual(arg, '--force'); assert.notEqual(arg, '-f'); assert.ok(!arg.startsWith('+')); }
});


test('incoming validation rejects bad names, invalid JSON/JSONL, symlinks and wrong audit dates without git', t => {
  const d = temp(t), dir = path.join(d, 'incoming');
  const reset = () => {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const n of offerFiles) write(dir, n, n.endsWith('.jsonl') ? '{}\n\n{}\n' : '{}');
  };
  reset(); assert.equal(incoming(dir, 'offer', '2026-11-15').length, 3);
  for (const mode of ['name', 'json', 'jsonl', 'symlink', 'missing']) {
    reset();
    if (mode === 'name') write(dir, 'unexpected.json', '{}');
    if (mode === 'json') write(dir, 'ledger.json', '{');
    if (mode === 'jsonl') write(dir, 'history.jsonl', '{}\n{');
    if (mode === 'missing' || mode === 'symlink') fs.unlinkSync(path.join(dir, 'ledger.json'));
    if (mode === 'symlink') fs.symlinkSync(path.join(dir, 'daily-state.json'), path.join(dir, 'ledger.json'));
    assert.throws(() => incoming(dir, 'offer', '2026-11-15'), mode);
  }
  fs.rmSync(dir, { recursive: true });
  write(dir, '2026-11-15-db-audit.json', '{"findings":[]}'); write(dir, '2026-11-15-db-audit.md', 'synthetic');
  assert.equal(incoming(dir, 'audit', '2026-11-15').length, 2);
  assert.throws(() => incoming(dir, 'audit', '2026-11-16'));
  assert.throws(() => incoming(dir, 'audit', '2026-02-30'));
  write(dir, '2026-11-15-url-check.json', '{'); assert.throws(() => incoming(dir, 'audit', '2026-11-15'));
});

function clone(f, name, sha = f.base) {
  const repo = path.join(f.d, name);
  gitRunner(f.d, ['clone', '--branch', 'ops-state', f.origin, repo]);
  gitRunner(repo, ['reset', '--hard', sha]); return repo;
}
function auditCommit(f, repo = f.repo, id = '456', base = f.base) {
  const from = path.join(f.d, `audit-${id}`);
  write(from, '2026-11-15-db-audit.json', JSON.stringify({ synthetic: id }));
  return commitState({ ...f.a, repo, from, job: 'audit', 'run-id': id, 'base-sha': base }, f.runner);
}
function concurrentCommit(f, change, subject = 'state(weekly-audit): synthetic') {
  const other = clone(f, 'other'); change(other);
  gitRunner(other, ['add', '.']); gitRunner(other, ['commit', '-m', subject], botIdentity);
  gitRunner(other, ['push', 'origin', 'HEAD:refs/heads/ops-state']);
  gitRunner(f.repo, ['fetch', 'origin', 'refs/heads/ops-state']);
  return gitRunner(other, ['rev-parse', 'HEAD']);
}
for (const mode of ['other', 'own', 'readme', 'other-path', 'own-entry', 'own-run', 'top-level', 'subject', 'diverged', 'same']) test(`concurrent predicate: ${mode}`, t => {
  const f = repoFixture(t);
  const tip = concurrentCommit(f, repo => {
    if (mode === 'own') write(repo, 'offer-watch/ledger.json', '{"changed":true}');
    else if (mode === 'readme' || mode === 'other-path') write(repo, mode === 'readme' ? 'README.md' : 'misc/file', 'synthetic');
    else if (['own-entry', 'own-run', 'top-level'].includes(mode)) {
      const m = manifestAt(repo);
      if (mode === 'own-entry') m.files.find(f => f.path === 'offer-watch/ledger.json').source = 'changed';
      if (mode === 'own-run') m.runs.offer = { last_run_id: '999' };
      if (mode === 'top-level') m.custom = 'changed';
      write(repo, 'MANIFEST.json', JSON.stringify(m));
    } else write(repo, 'audit/synthetic.md', 'synthetic');
  }, mode === 'subject' ? 'unrelated commit' : undefined);
  if (mode === 'diverged') {
    write(f.repo, 'audit/local.md', 'synthetic'); gitRunner(f.repo, ['add', '.']); gitRunner(f.repo, ['commit', '-m', 'state(weekly-audit): local'], botIdentity);
  }
  assert.equal(concurrentChangeIsSafe(f.repo, 'offer', mode === 'diverged' ? gitRunner(f.repo, ['rev-parse', 'HEAD']) : f.base, mode === 'same' ? f.base : tip, f.runner), mode === 'other');
});
for (const checkout of ['old-base', 'new-tip']) test(`overlapping audit then offer retries once from ${checkout}`, t => {
  const f = repoFixture(t), audit = auditCommit(f);
  const repo = clone(f, 'offer-clone', checkout === 'old-base' ? f.base : audit.commit_sha);
  const result = commitState({ ...f.a, repo }, f.runner);
  assert.equal(result.committed, true); assert.equal(result.rebased, true);
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), result.commit_sha);
  assert.equal(gitRunner(repo, ['rev-parse', 'HEAD^']), audit.commit_sha);
  const m = manifestAt(repo);
  assert.equal(m.runs.audit.last_run_id, '456'); assert.equal(m.runs.offer.last_run_id, '123');
  assert.equal(m.runs.offer.base_sha, f.base); assert.equal(m.runs.offer.rebased_onto, audit.commit_sha);
  assert.ok(m.files.some(f => f.path === 'audit/2026-11-15-db-audit.json'));
  for (const n of offerFiles) assert.ok(m.files.some(f => f.path === `offer-watch/${n}`));
  assert.equal(f.calls.filter(c => c[0] === 'fetch').length, 1);
});
for (const runs of ['missing', 'null']) for (const checkout of ['old-base', 'new-tip']) test(`overlapping audit then offer with ${runs} runs retries from ${checkout}`, t => {
  const f = repoFixture(t, m => { if (runs === 'missing') delete m.runs; else m.runs = null; });
  const baseManifest = JSON.parse(gitRunner(f.repo, ['show', `${f.base}:MANIFEST.json`]));
  assert.equal(Object.hasOwn(baseManifest, 'runs'), runs !== 'missing');
  assert.equal(baseManifest.runs, runs === 'missing' ? undefined : null);
  const audit = auditCommit(f), auditManifest = manifestAt(f.repo);
  const repo = clone(f, 'offer-clone', checkout === 'old-base' ? f.base : audit.commit_sha);
  assert.equal(concurrentChangeIsSafe(repo, 'offer', f.base, audit.commit_sha, f.runner), true);
  const result = commitState({ ...f.a, repo }, f.runner);
  assert.equal(result.committed, true); assert.equal(result.rebased, true);
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), result.commit_sha);
  assert.equal(gitRunner(repo, ['rev-parse', 'HEAD^']), audit.commit_sha);
  const m = manifestAt(repo);
  assert.deepEqual(m.runs.audit, auditManifest.runs.audit);
  assert.deepEqual(m.runs.offer, { last_run_id: '123', last_run_attempt: '1', pt_date: f.a['pt-date'], writer_epoch: f.a.epoch, base_sha: f.base, rebased_onto: audit.commit_sha });
  for (const entry of auditManifest.files.filter(f => f.path.startsWith('audit/'))) {
    assert.deepEqual(m.files.find(f => f.path === entry.path), entry);
    assert.deepEqual(fs.readFileSync(path.join(repo, entry.path)), fs.readFileSync(path.join(f.repo, entry.path)));
  }
  for (const n of offerFiles) {
    const bytes = fs.readFileSync(path.join(f.from, n));
    assert.deepEqual(fs.readFileSync(path.join(repo, 'offer-watch', n)), bytes);
    const entry = m.files.find(f => f.path === `offer-watch/${n}`);
    assert.equal(entry.sha256, sha256(bytes)); assert.equal(entry.size, bytes.length);
  }
  assert.equal(f.calls.filter(c => c[0] === 'fetch').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'push').length, checkout === 'old-base' ? 3 : 2); // includes audit push
});
for (const mode of ['own-dir', 'own-run', 'top-level']) for (const checkout of ['old', 'tip']) test(`conflict ${mode} with missing runs at ${checkout} stays unsafe`, t => {
  const f = repoFixture(t, m => { delete m.runs; });
  const tip = concurrentCommit(f, repo => {
    const m = manifestAt(repo);
    if (mode === 'own-dir') {
      const bytes = '{"changed":true}'; write(repo, 'offer-watch/ledger.json', bytes);
      const entry = m.files.find(f => f.path === 'offer-watch/ledger.json');
      entry.sha256 = sha256(bytes); entry.size = Buffer.byteLength(bytes);
    }
    if (mode === 'own-run') m.runs = { offer: { last_run_id: '999' } };
    if (mode === 'top-level') m.custom = 'changed';
    write(repo, 'MANIFEST.json', JSON.stringify(m));
  });
  const repo = clone(f, 'offer', checkout === 'old' ? f.base : tip);
  assert.equal(concurrentChangeIsSafe(repo, 'offer', f.base, tip, f.runner), false);
  assert.throws(() => commitState({ ...f.a, repo }, f.runner), e => e.exitCode === (checkout === 'old' ? 4 : 3) && e.message.includes('(not a safe other-job-only change)'));
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), tip);
  assert.equal(f.calls.filter(c => c[0] === 'push').length, checkout === 'old' ? 1 : 0);
});
for (const mode of ['own-dir', 'own-run', 'non-state']) for (const checkout of ['old', 'tip']) test(`conflict ${mode} at ${checkout} fails without pushing`, t => {
  const f = repoFixture(t);
  const tip = concurrentCommit(f, repo => {
    if (mode === 'own-dir') write(repo, 'offer-watch/ledger.json', '{"changed":true}');
    if (mode === 'non-state') write(repo, 'README.md', 'synthetic');
    const m = JSON.parse(fs.readFileSync(path.join(repo, 'MANIFEST.json')));
    if (mode === 'own-dir') { const e = m.files.find(f => f.path === 'offer-watch/ledger.json'), bytes = fs.readFileSync(path.join(repo, e.path)); e.sha256 = sha256(bytes); e.size = bytes.length; }
    if (mode === 'own-run') m.runs.offer = { last_run_id: '999' };
    write(repo, 'MANIFEST.json', JSON.stringify(m));
  });
  const repo = clone(f, 'offer', checkout === 'old' ? f.base : tip);
  assert.throws(() => commitState({ ...f.a, repo }, f.runner), e => e.exitCode === (checkout === 'old' ? 4 : 3) && e.message.includes('(not a safe other-job-only change)'));
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), tip);
});
for (const checkout of ['old', 'tip']) test(`second movement after ${checkout} retry fails without overwriting origin`, t => {
  const f = repoFixture(t), first = auditCommit(f), repo = clone(f, 'offer', checkout === 'old' ? f.base : first.commit_sha);
  let second, pushes = 0;
  const runner = (r, argv, env) => {
    if (argv[0] === 'push' && ++pushes === (checkout === 'old' ? 2 : 1)) second = auditCommit(f, f.repo, '457', first.commit_sha);
    return f.runner(r, argv, env);
  };
  assert.throws(() => commitState({ ...f.a, repo }, runner), e => e.exitCode === 4);
  assert.equal(gitRunner(f.origin, ['rev-parse', 'refs/heads/ops-state']), second.commit_sha);
  assert.equal(f.calls.filter(c => c[0] === 'fetch').length, 1);
});
test('dirty checkout is refused before any reset', t => {
  const f = repoFixture(t); auditCommit(f); write(f.repo, 'untracked.txt', 'synthetic');
  assert.throws(() => commitState(f.a, f.runner), /not clean/);
  assert.equal(f.calls.some(c => c[0] === 'reset'), false);
});

test('audit safely retries after an offer state commit', t => {
  const f = repoFixture(t), offer = commitState(f.a, f.runner);
  const result = auditCommit(f, clone(f, 'audit-clone'));
  assert.equal(result.rebased, true);
  const repo = path.join(f.d, 'audit-clone'), m = manifestAt(repo);
  assert.equal(gitRunner(repo, ['rev-parse', 'HEAD^']), offer.commit_sha);
  assert.equal(m.runs.offer.last_run_id, '123'); assert.equal(m.runs.audit.last_run_id, '456');
});
test('intervening unrelated subject is refused even if final subject is normal', t => {
  const f = repoFixture(t);
  write(f.repo, 'audit/first.md', 'synthetic'); gitRunner(f.repo, ['add', '.']); gitRunner(f.repo, ['commit', '-m', 'manual audit edit'], botIdentity);
  write(f.repo, 'audit/second.md', 'synthetic'); gitRunner(f.repo, ['add', '.']); gitRunner(f.repo, ['commit', '-m', 'state(weekly-audit): normal'], botIdentity);
  assert.equal(concurrentChangeIsSafe(f.repo, 'offer', f.base, gitRunner(f.repo, ['rev-parse', 'HEAD']), f.runner), false);
});
test('local commits outside fetched history cannot be discarded on stale HEAD retry', t => {
  const f = repoFixture(t), repo = clone(f, 'local'); auditCommit(f);
  write(repo, 'audit/local.md', 'synthetic'); gitRunner(repo, ['add', '.']); gitRunner(repo, ['commit', '-m', 'state(weekly-audit): local'], botIdentity);
  const head = gitRunner(repo, ['rev-parse', 'HEAD']);
  assert.throws(() => commitState({ ...f.a, repo }, f.runner), e => e.exitCode === 3);
  assert.equal(gitRunner(repo, ['rev-parse', 'HEAD']), head);
});

function stateCommit(repo, env = botIdentity) {
  gitRunner(repo, ['add', '.']);
  gitRunner(repo, ['commit', '-m', 'state(weekly-audit): synthetic'], env);
  return gitRunner(repo, ['rev-parse', 'HEAD']);
}
test('cross-directory rename from offer-watch/x to audit/y is unsafe', t => {
  const f = repoFixture(t);
  write(f.repo, 'offer-watch/x', 'synthetic rename content');
  const base = stateCommit(f.repo);
  gitRunner(f.repo, ['mv', 'offer-watch/x', 'audit/y']);
  const tip = stateCommit(f.repo);
  assert.equal(concurrentChangeIsSafe(f.repo, 'offer', base, tip), false);
});
for (const role of ['AUTHOR', 'COMMITTER']) test(`intervening non-bot ${role.toLowerCase()} is unsafe even with a normal final commit`, t => {
  const f = repoFixture(t);
  write(f.repo, 'audit/first.md', 'synthetic');
  stateCommit(f.repo, { ...botIdentity, [`GIT_${role}_EMAIL`]: 'fixture@example.com' });
  write(f.repo, 'audit/second.md', 'synthetic');
  const tip = stateCommit(f.repo);
  assert.equal(concurrentChangeIsSafe(f.repo, 'offer', f.base, tip), false);
});
test('merge commit in the range is unsafe even with bot identities and state subjects', t => {
  const f = repoFixture(t);
  gitRunner(f.repo, ['checkout', '-b', 'side']);
  write(f.repo, 'audit/side.md', 'synthetic'); stateCommit(f.repo);
  gitRunner(f.repo, ['checkout', 'ops-state']);
  write(f.repo, 'audit/main.md', 'synthetic'); stateCommit(f.repo);
  gitRunner(f.repo, ['merge', '--no-ff', 'side', '-m', 'state(weekly-audit): merge'], botIdentity);
  const tip = gitRunner(f.repo, ['rev-parse', 'HEAD']);
  assert.equal(concurrentChangeIsSafe(f.repo, 'offer', f.base, tip), false);
});
for (const endpoint of ['base', 'tip']) for (const files of [undefined, null, {}]) test(`manifest files ${JSON.stringify(files)} at ${endpoint} is unsafe`, t => {
  const f = repoFixture(t), manifest = manifestAt(f.repo);
  const invalid = { ...manifest, files };
  let base = f.base;
  if (endpoint === 'base') {
    write(f.repo, 'MANIFEST.json', JSON.stringify(invalid)); base = stateCommit(f.repo);
  }
  write(f.repo, 'MANIFEST.json', JSON.stringify(endpoint === 'tip' ? invalid : manifest));
  write(f.repo, 'audit/other.md', 'synthetic');
  const tip = stateCommit(f.repo);
  assert.equal(concurrentChangeIsSafe(f.repo, 'offer', base, tip), false);
});
test('both commit-state ops-state checkouts fetch full history', () => {
  for (const name of ['offer-watch-cloud', 'weekly-audit-cloud', 'gsc-cloud']) {
    const workflow = fs.readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
    const job = workflow.split('\n  commit-state:')[1].split(/\n  [\w-]+:/)[0];
    const checkouts = job.split(/\n      - /).filter(step => /uses: actions\/checkout@/.test(step) && /\n          ref: ops-state\n/.test(step));
    assert.equal(checkouts.length, 1, name);
    assert.match(checkouts[0], /\n          path: ops-state\n/);
    assert.match(checkouts[0], /\n          fetch-depth: 0\n/);
  }
});

function gscIncoming(dir, weekly = false) {
  for (const name of ['history.json', 'cohort-baseline.json', '2026-11-15-daily.json', '2026-11-15-daily.md', ...(weekly ? ['2026-11-15-weekly.json', '2026-11-15-weekly.md'] : [])]) write(dir, name, name.endsWith('.json') ? '{}' : 'synthetic report');
}
test('gsc first-run pull needs no prior history; later pull copies only persistent state', t => {
  const d = temp(t), src = path.join(d, 'src'); snapshot(src);
  const empty = path.join(d, 'empty'); pull({ src, job: 'gsc', out: empty });
  assert.deepEqual(fs.readdirSync(empty), []);
  const m = manifestAt(src);
  for (const name of ['history.json', 'cohort-baseline.json', '2026-11-14-daily.json']) {
    write(src, `gsc/${name}`, '{}'); m.files.push({ path: `gsc/${name}`, sha256: sha256('{}'), size: 2 });
  }
  write(src, 'gsc/unlisted.json', '{}'); write(src, 'MANIFEST.json', JSON.stringify(m));
  const out = path.join(d, 'out'); pull({ src, job: 'gsc', out });
  assert.deepEqual(fs.readdirSync(out).sort(), ['cohort-baseline.json', 'history.json']);
  assert.throws(() => pull({ src, job: 'gsc', out }), /pristine/);
});
test('gsc incoming requires all daily and state files, paired optional weekly files, valid JSON and today names', t => {
  const d = temp(t), dir = path.join(d, 'incoming');
  const reset = () => { fs.rmSync(dir, { recursive: true, force: true }); gscIncoming(dir); };
  reset(); assert.equal(incoming(dir, 'gsc', '2026-11-15').length, 4);
  gscIncoming(dir, true); assert.equal(incoming(dir, 'gsc', '2026-11-15').length, 6);
  for (const name of ['history.json', 'cohort-baseline.json', '2026-11-15-daily.json', '2026-11-15-daily.md']) {
    reset(); fs.unlinkSync(path.join(dir, name)); assert.throws(() => incoming(dir, 'gsc', '2026-11-15'), /missing/);
  }
  for (const [name, bytes] of [['2026-11-14-weekly.md', 'synthetic'], ['2026-11-15-notes.md', 'synthetic'], ['history.json', '{'], ['2026-11-15-daily.json', '{']]) {
    reset(); write(dir, name, bytes); assert.throws(() => incoming(dir, 'gsc', '2026-11-15'));
  }
  reset(); write(dir, '2026-11-15-weekly.json', '{}'); assert.throws(() => incoming(dir, 'gsc', '2026-11-15'), /incomplete/);
  reset(); fs.unlinkSync(path.join(dir, 'history.json')); fs.symlinkSync(path.join(dir, 'cohort-baseline.json'), path.join(dir, 'history.json'));
  assert.throws(() => incoming(dir, 'gsc', '2026-11-15'), /regular/);
});
test('gsc commit subject and single retry preserve both offer and audit writers', t => {
  const f = repoFixture(t);
  const offer = commitState(f.a, f.runner);
  const audit = auditCommit(f, f.repo, '456', offer.commit_sha);
  const repo = clone(f, 'gsc-clone'), from = path.join(f.d, 'gsc-incoming'); gscIncoming(from, true);
  assert.equal(concurrentChangeIsSafe(repo, 'gsc', f.base, audit.commit_sha, f.runner), true);
  const result = commitState({ ...f.a, repo, from, job: 'gsc', epoch: 'gsc-test' }, f.runner);
  assert.equal(result.rebased, true);
  assert.equal(gitRunner(repo, ['rev-parse', 'HEAD^']), audit.commit_sha);
  assert.equal(gitRunner(repo, ['log', '-1', '--format=%s']), 'state(gsc): 2026-11-15 run 123 attempt 1');
  const m = manifestAt(repo);
  assert.equal(m.runs.gsc.rebased_onto, audit.commit_sha);
  assert.equal(m.runs.offer.last_run_id, '123'); assert.equal(m.runs.audit.last_run_id, '456');
  assert.equal(m.files.filter(f => f.path.startsWith('gsc/')).length, 6);
});
for (const mode of ['own-dir', 'own-run', 'wrong-label', 'cross-directory']) test(`gsc concurrent conflict ${mode} is unsafe`, t => {
  const f = repoFixture(t);
  const tip = concurrentCommit(f, repo => {
    const m = manifestAt(repo);
    if (mode === 'own-dir') write(repo, 'gsc/history.json', '{}');
    if (mode === 'own-run') { m.runs.gsc = { last_run_id: '999' }; write(repo, 'MANIFEST.json', JSON.stringify(m)); }
    if (mode === 'wrong-label') write(repo, 'offer-watch/new.md', 'synthetic');
    if (mode === 'cross-directory') gitRunner(repo, ['mv', 'offer-watch/ledger.json', 'audit/moved.json']);
  });
  assert.equal(concurrentChangeIsSafe(f.repo, 'gsc', f.base, tip, f.runner), false);
});
test('offer safely retries after gsc state writer', t => {
  const f = repoFixture(t), from = path.join(f.d, 'gsc-incoming'); gscIncoming(from);
  const gsc = commitState({ ...f.a, from, job: 'gsc' }, f.runner);
  const repo = clone(f, 'offer-clone');
  const result = commitState({ ...f.a, repo }, f.runner);
  assert.equal(result.rebased, true);
  assert.equal(gitRunner(repo, ['rev-parse', 'HEAD^']), gsc.commit_sha);
  assert.equal(manifestAt(repo).runs.gsc.last_run_id, '123');
});
