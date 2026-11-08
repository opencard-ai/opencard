#!/usr/bin/env node
// Portable ops state bundle: export/verify/import the NON-SECRET state files that
// Mac-hosted ops jobs depend on, so a cloud runner can start from the same state.
// INCOMPLETE HARNESS: this moves files only. It does not migrate any job, does not
// hold credentials (GSC OAuth token, AgentMail key are deliberately excluded), and
// is not a durable backup by itself; storage/retention must be chosen separately.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const OPS = {
  gsc: [/^\.gsc-report-history\.json$/, /^\.gsc-cohort-baseline\.json$/],
  audit: [/^artifacts\/audit\/\d{4}-\d{2}-\d{2}-(db-audit\.json|db-audit\.md|url-check\.json)$/],
};
const FORBIDDEN = /(token|secret|credential|\.env|key)/i;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function listOp(root, op) {
  const pats = OPS[op];
  if (!pats) throw new Error(`unknown op: ${op}`);
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (r === 'artifacts' || r === 'artifacts/audit') walk(r); continue; }
      if (pats.some((p) => p.test(r))) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

export function exportBundle(root, ops) {
  const files = [];
  for (const op of ops) for (const rel of listOp(root, op)) {
    if (FORBIDDEN.test(path.basename(rel))) throw new Error(`refusing secret-like file: ${rel}`);
    const data = fs.readFileSync(path.join(root, rel));
    if (rel.endsWith('.json')) JSON.parse(data.toString('utf8'));
    files.push({ op, path: rel, sha256: sha256(data), content: data.toString('base64') });
  }
  const body = { version: 1, createdAt: new Date().toISOString(), ops, files };
  return { ...body, digest: sha256(JSON.stringify(files.map(({ path: p, sha256: h }) => [p, h]))) };
}

export function verifyBundle(bundle) {
  if (bundle?.version !== 1 || !Array.isArray(bundle.files)) throw new Error('invalid bundle');
  const seen = new Set();
  for (const f of bundle.files) {
    if (typeof f.path !== 'string' || f.path.includes('..') || path.isAbsolute(f.path) || seen.has(f.path)) throw new Error(`bad path: ${f.path}`);
    seen.add(f.path);
    if (!(OPS[f.op] || []).some((p) => p.test(f.path))) throw new Error(`path not allowlisted for ${f.op}: ${f.path}`);
    if (sha256(Buffer.from(f.content, 'base64')) !== f.sha256) throw new Error(`hash mismatch: ${f.path}`);
  }
  const d = sha256(JSON.stringify(bundle.files.map(({ path: p, sha256: h }) => [p, h])));
  if (d !== bundle.digest) throw new Error('digest mismatch');
  return true;
}

function assertPrivate(st, what) {
  if ((st.mode & 0o022) || (typeof process.getuid === 'function' && st.uid !== process.getuid())) throw new Error(`${what} must be owned by the current user and not group/other-writable`);
}

function assertProtectedAncestry(realRoot) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  for (let d = path.dirname(realRoot); ; d = path.dirname(d)) {
    const st = fs.statSync(d);
    if (uid !== null && st.uid !== uid && st.uid !== 0) throw new Error(`ancestor ${d} owned by another user`);
    if ((st.mode & 0o022) && !(st.mode & 0o1000)) throw new Error(`ancestor ${d} is shared-writable without sticky bit`);
    if (d === path.dirname(d)) break;
  }
}

// EXPERIMENTAL import. Threat model: the target tree is private to the operator (owned by the
// current uid, no group/other write). Under that model a concurrent attacker cannot swap
// ancestors. It is NOT TOCTOU-safe against a same-uid concurrent writer (Node lacks openat).
// Import never overwrites differing existing files (fail closed); identical files are skipped.
export function importBundle(bundle, root) {
  verifyBundle(bundle);
  const conflicts = [];
  for (const f of bundle.files) {
    const abs = path.join(root, f.path);
    const ls = fs.lstatSync(abs, { throwIfNoEntry: false });
    if (ls && (!ls.isFile() || sha256(fs.readFileSync(abs)) !== f.sha256)) conflicts.push(f.path);
  }
  if (conflicts.length) throw new Error(`conflicting existing files: ${conflicts.join(', ')}`);
  const realRoot = fs.realpathSync(root);
  // Node has no openat(); residual TOCTOU is bounded by requiring a root only this user can modify
  // and an ancestry above it that no other uid can rename (owned by us/root, or sticky if shared-writable).
  assertPrivate(fs.statSync(realRoot), 'import root');
  assertProtectedAncestry(realRoot);
  const written = [];
  for (const f of bundle.files) {
    const abs = path.join(realRoot, f.path);
    if (fs.lstatSync(abs, { throwIfNoEntry: false })) continue;
    // Walk/create one component at a time, validating each BEFORE descending (no symlinks, private).
    let cur = realRoot;
    for (const part of path.dirname(f.path).split('/').filter((x) => x && x !== '.')) {
      cur = path.join(cur, part);
      let ls = fs.lstatSync(cur, { throwIfNoEntry: false });
      if (!ls) { fs.mkdirSync(cur, { mode: 0o700 }); ls = fs.lstatSync(cur); }
      if (ls.isSymbolicLink() || !ls.isDirectory()) throw new Error(`destination escapes root: ${f.path}`);
      assertPrivate(ls, cur);
    }
    if (fs.realpathSync(cur) !== cur) throw new Error(`destination escapes root: ${f.path}`);
    const final = path.join(cur, path.basename(abs));
    const tmp = `${final}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      fs.writeFileSync(tmp, Buffer.from(f.content, 'base64'), { flag: 'wx', mode: 0o600 });
      // linkSync is atomic and fails with EEXIST: a concurrently created file is never overwritten.
      fs.linkSync(tmp, final);
    } finally { fs.rmSync(tmp, { force: true }); }
    written.push(f.path);
  }
  return written;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const arg = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === 'export') {
    const root = arg('--root') || process.cwd(); const out = arg('--out');
    const ops = (arg('--ops') || 'gsc,audit').split(',');
    if (!out) throw new Error('--out required');
    const b = exportBundle(root, ops);
    fs.writeFileSync(out, JSON.stringify(b), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ files: b.files.length, digest: b.digest }));
  } else if (cmd === 'verify' || cmd === 'import') {
    const b = JSON.parse(fs.readFileSync(arg('--in'), 'utf8'));
    if (cmd === 'verify') { verifyBundle(b); console.log(JSON.stringify({ ok: true, files: b.files.length, digest: b.digest })); }
    else { if (!rest.includes('--experimental-import')) throw new Error('import is experimental; pass --experimental-import (private target only, not TOCTOU-safe vs same-uid writers)'); const root = arg('--root'); if (!root) throw new Error('--root required'); console.log(JSON.stringify({ written: importBundle(b, root) })); }
  } else throw new Error('usage: ops-state.mjs export|verify|import ...');
}
const self = process.argv[1] && fs.existsSync(process.argv[1]) ? pathToFileURL(fs.realpathSync(process.argv[1])).href : '';
if (self && pathToFileURL(fs.realpathSync(fileURLToPath(import.meta.url))).href === self) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`ops-state: ${e.message}`); process.exitCode = 1; }
}
