import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, jobs, gscFiles, manifestAt, offerFiles, auditPattern, validDate, directory } from './core.mjs';
export function pull({ src, job, out, today }) {
  if (!Object.hasOwn(jobs, job)) throw new Error('invalid job');
  if (job === 'audit' && !validDate(today)) throw new Error('audit requires valid --today');
  const manifest = manifestAt(src);
  const listed = new Set(manifest.files.map(f => f.path));
  const rels = job === 'offer' ? offerFiles.map(f => `offer-watch/${f}`) : job === 'gsc' ? gscFiles.map(f => `gsc/${f}`).filter(f => listed.has(f)) : [...listed].filter(f => f.startsWith('audit/') && auditPattern.test(path.basename(f)) && path.basename(f).slice(0, 10) < today);
  if ((job !== 'gsc' && !rels.length) || rels.some(f => !listed.has(f))) throw new Error('required state missing from manifest');
  if (job === 'audit' && !rels.some(f => f.endsWith('-db-audit.json'))) throw new Error('no earlier audit baseline');
  if (job === 'gsc') for (const rel of rels) JSON.parse(fs.readFileSync(path.join(src, rel), 'utf8'));
  fs.mkdirSync(out, { recursive: true }); directory(out);
  for (const rel of rels) {
    const dest = path.join(out, path.basename(rel));
    if (fs.existsSync(dest) || fs.lstatSync(out).isSymbolicLink()) throw new Error('output must be pristine');
    fs.copyFileSync(path.join(src, rel), dest, fs.constants.COPYFILE_EXCL);
  }
  console.log(`verified ${manifest.files.length} files; copied ${rels.length}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { pull(args(process.argv.slice(2))); } catch (e) { console.error(`pull: ${e.message}`); process.exitCode = 2; }
}
