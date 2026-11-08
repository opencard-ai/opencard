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
