import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportBundle, verifyBundle, importBundle } from './ops-state.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ops-state-'));
function fixture() {
  const r = tmp();
  fs.writeFileSync(path.join(r, '.gsc-report-history.json'), '[{"date":"2026-11-01"}]');
  fs.writeFileSync(path.join(r, '.gsc-cohort-baseline.json'), '{"capturedAt":"x","indexableUrls":[]}');
  fs.writeFileSync(path.join(r, '.gsc-token.json'), '{"refresh_token":"SYNTHETIC"}');
  fs.writeFileSync(path.join(r, '.env.local'), 'X=1');
  fs.mkdirSync(path.join(r, 'artifacts/audit'), { recursive: true });
  fs.writeFileSync(path.join(r, 'artifacts/audit/2026-10-02-db-audit.json'), '{"findings":[]}');
  fs.writeFileSync(path.join(r, 'artifacts/audit/notes.txt'), 'ignored');
  return r;
}

test('export includes only allowlisted state, never token/env', () => {
  const b = exportBundle(fixture(), ['gsc', 'audit']);
  assert.deepEqual(b.files.map((f) => f.path), ['.gsc-cohort-baseline.json', '.gsc-report-history.json', 'artifacts/audit/2026-10-02-db-audit.json']);
  for (const f of b.files) assert.ok(!Buffer.from(f.content, 'base64').toString().includes('SYNTHETIC'));
  assert.equal(verifyBundle(b), true);
});

test('round trip restores byte-identical files; reimport is idempotent', () => {
  const src = fixture(); const dst = tmp();
  const b = exportBundle(src, ['gsc', 'audit']);
  assert.equal(importBundle(b, dst).length, 3);
  for (const f of b.files) assert.deepEqual(fs.readFileSync(path.join(dst, f.path)), fs.readFileSync(path.join(src, f.path)));
  assert.deepEqual(importBundle(b, dst), []);
});

test('import fails closed on conflict and writes nothing', () => {
  const b = exportBundle(fixture(), ['gsc']);
  const dst = tmp();
  fs.writeFileSync(path.join(dst, '.gsc-cohort-baseline.json'), '{"different":true}');
  assert.throws(() => importBundle(b, dst), /conflicting/);
  assert.ok(!fs.existsSync(path.join(dst, '.gsc-report-history.json')));
});

test('tampered, traversal and non-allowlisted bundles are rejected', () => {
  const b = exportBundle(fixture(), ['gsc']);
  const t1 = structuredClone(b); t1.files[0].content = Buffer.from('[]').toString('base64');
  assert.throws(() => verifyBundle(t1), /hash mismatch/);
  const t2 = structuredClone(b); t2.files[0].path = '../x.json';
  assert.throws(() => verifyBundle(t2), /bad path/);
  const t3 = structuredClone(b); t3.files[0].path = '.gsc-token.json';
  assert.throws(() => verifyBundle(t3), /not allowlisted/);
});

test('invalid JSON state is refused at export', () => {
  const r = fixture(); fs.writeFileSync(path.join(r, '.gsc-report-history.json'), '{bad');
  assert.throws(() => exportBundle(r, ['gsc']));
});

test('CLI export/verify/import works and output is 0600', () => {
  const src = fixture(); const dst = tmp(); const out = path.join(tmp(), 'b.json');
  const cli = path.join(import.meta.dirname, 'ops-state.mjs');
  const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8' });
  assert.equal(run('export', '--root', src, '--out', out).status, 0);
  assert.equal(fs.statSync(out).mode & 0o777, 0o600);
  assert.equal(run('verify', '--in', out).status, 0);
  assert.equal(run('import', '--in', out, '--root', dst).status, 1);
  assert.equal(run('import', '--in', out, '--root', dst, '--experimental-import').status, 0);
  assert.ok(fs.existsSync(path.join(dst, 'artifacts/audit/2026-10-02-db-audit.json')));
  assert.equal(run('export', '--root', src, '--out', out).status, 1); // wx: never overwrite
});

test('import refuses symlinked destination escaping root', () => {
  const b = exportBundle(fixture(), ['audit']);
  const dst = tmp(); const outside = tmp();
  fs.mkdirSync(path.join(dst, 'artifacts'));
  fs.symlinkSync(outside, path.join(dst, 'artifacts/audit'));
  assert.throws(() => importBundle(b, dst), /escapes root/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('identical existing GSC baseline is preserved untouched (same inode)', () => {
  const src = fixture(); const dst = tmp();
  const b = exportBundle(src, ['gsc']);
  fs.copyFileSync(path.join(src, '.gsc-cohort-baseline.json'), path.join(dst, '.gsc-cohort-baseline.json'));
  const ino = fs.statSync(path.join(dst, '.gsc-cohort-baseline.json')).ino;
  assert.deepEqual(importBundle(b, dst), ['.gsc-report-history.json']);
  assert.equal(fs.statSync(path.join(dst, '.gsc-cohort-baseline.json')).ino, ino);
});

test('import refuses a shared-writable root', () => {
  const b = exportBundle(fixture(), ['gsc']); const dst = tmp();
  fs.chmodSync(dst, 0o777);
  assert.throws(() => importBundle(b, dst), /not group\/other-writable/);
});

test('import refuses a nonprivate or foreign-owned intermediate directory', () => {
  const b = exportBundle(fixture(), ['audit']); const dst = tmp();
  fs.mkdirSync(path.join(dst, 'artifacts/audit'), { recursive: true });
  fs.chmodSync(path.join(dst, 'artifacts'), 0o777);
  assert.throws(() => importBundle(b, dst), /artifacts must be owned/);
  assert.deepEqual(fs.readdirSync(path.join(dst, 'artifacts/audit')), []);
});

test('ancestor symlink pointing inside root is still refused', () => {
  const b = exportBundle(fixture(), ['audit']); const dst = tmp();
  fs.mkdirSync(path.join(dst, 'real/audit'), { recursive: true });
  fs.symlinkSync(path.join(dst, 'real'), path.join(dst, 'artifacts'));
  assert.throws(() => importBundle(b, dst), /escapes root/);
});

test('a symlinked final file is treated as existing and never written through', () => {
  const b = exportBundle(fixture(), ['gsc']); const dst = tmp(); const outside = tmp();
  fs.symlinkSync(path.join(outside, 'victim.json'), path.join(dst, '.gsc-report-history.json'));
  assert.throws(() => importBundle(b, dst), /conflicting/);
  assert.ok(!fs.existsSync(path.join(outside, 'victim.json')));
});

test('import aborted midway is recoverable by re-running; no tmp files left', () => {
  const b = exportBundle(fixture(), ['gsc', 'audit']); const dst = tmp();
  fs.mkdirSync(path.join(dst, 'artifacts/audit'), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.join(dst, 'artifacts/audit'), 0o500);
  assert.throws(() => importBundle(b, dst), /EACCES/);
  assert.ok(fs.existsSync(path.join(dst, '.gsc-report-history.json')));
  fs.chmodSync(path.join(dst, 'artifacts/audit'), 0o700);
  assert.deepEqual(importBundle(b, dst), ['artifacts/audit/2026-10-02-db-audit.json']);
  const all = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(e.name); };
  walk(dst); assert.ok(!all.some((n) => n.includes('.tmp-')));
});

test('imported files are 0600 and dirs created 0700', () => {
  const b = exportBundle(fixture(), ['audit']); const dst = tmp();
  importBundle(b, dst);
  assert.equal(fs.statSync(path.join(dst, 'artifacts/audit/2026-10-02-db-audit.json')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(dst, 'artifacts')).mode & 0o077, 0);
});

test('escaping ancestor symlink creates nothing outside root', () => {
  const b = exportBundle(fixture(), ['audit']); const dst = tmp(); const outside = tmp();
  fs.symlinkSync(outside, path.join(dst, 'artifacts'));
  assert.throws(() => importBundle(b, dst), /escapes root/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('root under a shared-writable non-sticky parent is refused', () => {
  const parent = tmp(); fs.chmodSync(parent, 0o777);
  const dst = path.join(parent, 'root'); fs.mkdirSync(dst, { mode: 0o700 });
  const b = exportBundle(fixture(), ['gsc']);
  assert.throws(() => importBundle(b, dst), /without sticky bit/);
  assert.deepEqual(fs.readdirSync(dst), []);
});

test('pre-existing final file appearing between check and link is not overwritten (EEXIST)', () => {
  const b = exportBundle(fixture(), ['gsc']); const dst = tmp();
  const orig = fs.linkSync;
  fs.linkSync = (a, c) => { fs.writeFileSync(c, 'RACER'); return orig(a, c); };
  try { assert.throws(() => importBundle(b, dst), /EEXIST/); } finally { fs.linkSync = orig; }
  const names = fs.readdirSync(dst);
  assert.ok(names.every((n) => !n.includes('.tmp-')));
  assert.equal(fs.readFileSync(path.join(dst, names[0]), 'utf8'), 'RACER');
});
