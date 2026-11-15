/** Copy a pinned, already-extracted ops-state snapshot into runner temp dirs after verifying MANIFEST.json (read-only).
 *   npx tsx scripts/ops-shadow/load-state.ts --src <extracted ops-state dir> [--offer-out DIR] [--audit-out DIR --today YYYY-MM-DD]
 * Only files listed in MANIFEST.json are copied; symlinks, traversal or any sha256/size mismatch -> exit 2. */
import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_FILE_RE, OFFER_STATE_FILES, checkManifest, type ManifestFile } from './state-core';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const src = arg('--src');
if (!src) { console.error('usage: load-state.ts --src DIR [--offer-out DIR] [--audit-out DIR --today YYYY-MM-DD]'); process.exit(2); }
const fail = (m: string) => { console.error(`load-state: ${m}`); process.exit(2); };
const manifestPath = path.join(src, 'MANIFEST.json');
if (!fs.lstatSync(manifestPath).isFile()) fail('MANIFEST.json must be a regular file, not a symlink');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files?: ManifestFile[] };
const read = (rel: string) => {
  const p = path.join(src, rel);
  try {
    // lstat on the file alone would still follow a symlinked parent directory.
    if (!fs.lstatSync(path.dirname(p)).isDirectory()) return null;
    return fs.lstatSync(p).isFile() ? fs.readFileSync(p) : null;
  } catch { return null; }
};
const check = checkManifest(manifest.files || [], read);
if (!check.ok) fail(`manifest check failed: ${check.problems.join('; ') || 'no files'}`);
const listed = new Set((manifest.files || []).map(f => f.path));
const copy = (rels: string[], out: string) => { fs.mkdirSync(out, { recursive: true }); for (const r of rels) fs.copyFileSync(path.join(src, r), path.join(out, path.basename(r))); return rels.length; };
const offerOut = arg('--offer-out'), auditOut = arg('--audit-out');
if (offerOut) {
  const rels = OFFER_STATE_FILES.map(f => `offer-watch/${f}`);
  for (const r of rels) if (!listed.has(r)) fail(`offer state file not in manifest: ${r}`);
  console.log(`offer-watch: copied ${copy(rels, offerOut)} files`);
}
if (auditOut) {
  const today = arg('--today') || '';
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(Date.parse(today)) || new Date(today).toISOString().slice(0, 10) !== today) fail('--audit-out requires a valid --today YYYY-MM-DD');
  const rels = [...listed].filter(r => r.startsWith('audit/') && AUDIT_FILE_RE.test(path.basename(r)) && path.basename(r).slice(0, 10) < today).sort();
  if (!rels.length) fail('no audit reports before today in manifest');
  console.log(`audit: copied ${copy(rels, auditOut)} files (latest ${path.basename(rels.filter(r => r.endsWith('-db-audit.json')).at(-1) || '')})`);
}
console.log(`manifest verified: ${check.verified} files`);
