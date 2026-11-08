// End-to-end: real weekly.ts entrypoint + real db-audit.ts over real data/cards (read-only),
// url-check replaced by an allowlisted fixture, history in a temp OPENCARD_AUDIT_DIR.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '../..');
const fx = (n) => path.join(repo, 'scripts/audit/fixtures', n);
const tsx = path.join(repo, 'node_modules/tsx/dist/cli.mjs');
const run = (env) => spawnSync(process.execPath, [tsx, 'scripts/audit/weekly.ts'], { cwd: repo, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1', ...env }, timeout: 120000 });
const tree = (d) => { const h = crypto.createHash('sha256'); for (const f of fs.readdirSync(d).sort()) h.update(f).update(fs.readFileSync(path.join(d, f))); return h.digest('hex'); };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

test('first run writes baseline to override dir and prints NO_REPLY; default artifacts untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2e-'));
  const before = tree(path.join(repo, 'artifacts/audit'));
  const r = run({ OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /NO_REPLY/);
  assert.match(r.stderr, /FIXTURE url-check/);
  assert.ok(fs.existsSync(path.join(dir, `${today}-db-audit.json`)));
  assert.ok(fs.existsSync(path.join(dir, `${today}-db-audit.md`)));
  assert.equal(tree(path.join(repo, 'artifacts/audit')), before);
});

test('new high finding vs earlier baseline is reported; same-day rerun does not overwrite', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2e-'));
  fs.writeFileSync(path.join(dir, '2000-01-01-db-audit.json'), JSON.stringify({ findings: [] }));
  const r = run({ OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('one-404.url-check.json') });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /官方來源網址失效/);
  assert.match(r.stdout, /amazon-prime-visa/);
  assert.match(r.stdout, new RegExp(`${dir}/${today}-db-audit.md`));
  const saved = fs.readFileSync(path.join(dir, `${today}-db-audit.json`), 'utf8');
  const r2 = run({ OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') });
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stderr, /not overwriting/);
  assert.equal(fs.readFileSync(path.join(dir, `${today}-db-audit.json`), 'utf8'), saved);
});

test('fixture outside allowlist, without override dir, or aimed at artifacts/audit is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2e-'));
  const stray = path.join(dir, 'x.url-check.json');
  fs.copyFileSync(fx('all-ok.url-check.json'), stray);
  for (const env of [
    { OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: stray },
    { OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') },
    { OPENCARD_AUDIT_DIR: 'artifacts/audit/', OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') },
    { OPENCARD_AUDIT_DIR: path.join(dir, 'missing/audit'), OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') },
    { OPENCARD_AUDIT_DIR: (() => { const l = path.join(dir, 'alias2'); fs.symlinkSync(path.join(repo, 'artifacts'), l); return path.join(l, 'audit'); })(), OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') },
    { OPENCARD_AUDIT_DIR: (() => { const l = path.join(dir, 'alias'); fs.symlinkSync(path.join(repo, 'artifacts/audit'), l); return l; })(), OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') },
  ]) {
    const before = tree(path.join(repo, 'artifacts/audit'));
    const r = run(env);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /fixture/);
    assert.equal(tree(path.join(repo, 'artifacts/audit')), before);
  }
});

test('default (no fixture env) path still invokes live url-check (static contract)', () => {
  const src = fs.readFileSync(path.join(repo, 'scripts/audit/weekly.ts'), 'utf8');
  assert.match(src, /else run\(\['scripts\/audit\/url-check\.ts', '--official-only', '--out', urlOut\]\)/);
  assert.match(src, /if \(!raw\) return null;/);
});

test('fixture run refuses to write through a pre-planted report symlink into the repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2e-'));
  const victim = path.join(repo, 'artifacts/audit/2026-10-02-url-check.json');
  const before = fs.readFileSync(victim);
  fs.symlinkSync(victim, path.join(dir, `${today}-url-check.json`));
  const r = run({ OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json') });
  assert.equal(r.status, 1);
  assert.deepEqual(fs.readFileSync(victim), before);
});

test('durable fixture records baseline, suppresses same-day rerun, reports against seeded older baseline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-durable-'));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-state-'));
  const env = { OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('one-404.url-check.json'), OPENCARD_AUDIT_DURABLE: `fixture-file:${state}` };
  const first = run(env);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.trim(), 'DURABLE:BASELINE_RECORDED');
  const second = run(env);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout.trim(), 'DURABLE:ALREADY_REPORTED');
  const file = path.join(state, 'audit-state.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const doc = JSON.parse(saved.docs['audit-baseline']);
  doc.value.date = '2000-01-01'; delete doc.value.reportedFor;
  doc.value.findings = []; doc.value.digest = crypto.createHash('sha256').update('[]').digest('hex');
  saved.docs['audit-baseline'] = JSON.stringify(doc);
  fs.writeFileSync(file, JSON.stringify(saved));
  const fresh = run(env);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /^DURABLE:CALLER_MUST_SEND\n📋 OpenCard/);
  assert.match(fresh.stdout, /amazon-prime-visa/);
});

test('durable mode rejects unsupported stores, missing fixture and unsafe directories', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-durable-'));
  for (const [durable, fixture, message] of [
    ['redis:live', fx('all-ok.url-check.json'), /unsupported durable store/],
    [`fixture-file:${dir}`, '', /requires OPENCARD_AUDIT_URLCHECK_FIXTURE/],
    [`fixture-file:${repo}`, fx('all-ok.url-check.json'), /outside the repo/],
    [`fixture-file:${dir}/missing`, fx('all-ok.url-check.json'), /ENOENT/],
  ]) {
    const r = run({ OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: fixture, OPENCARD_AUDIT_DURABLE: durable });
    assert.equal(r.status, 1); assert.match(r.stderr, message);
  }
});

test('fixture/durable run refuses TMPDIR inside the repo before writing anything', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2e-'));
  const inRepo = fs.mkdtempSync(path.join(repo, '.tmp-e2e-'));
  try {
    for (const extra of [{}, { OPENCARD_AUDIT_DURABLE: `fixture-file:${dir}` }]) {
      const r = run({ TMPDIR: inRepo, OPENCARD_AUDIT_DIR: dir, OPENCARD_AUDIT_URLCHECK_FIXTURE: fx('all-ok.url-check.json'), ...extra });
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, /TMPDIR outside the repo/);
      // tsx may create its own cache in TMPDIR; our lock/scratch must not exist.
      assert.deepEqual(fs.readdirSync(inRepo).filter(n => n.startsWith('opencard-audit')), []);
    }
  } finally { fs.rmSync(inRepo, { recursive: true, force: true }); }
});
