import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const offerFiles = ['ledger.json', 'history.jsonl', 'daily-state.json'];
export const auditPattern = /^\d{4}-\d{2}-\d{2}-(db-audit\.json|db-audit\.md|url-check\.json)$/;
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export function regular(p) { if (!fs.lstatSync(p).isFile()) throw new Error(`not a regular file: ${p}`); return fs.readFileSync(p); }
export function directory(p) { if (!fs.lstatSync(p).isDirectory()) throw new Error(`not a regular directory: ${p}`); }
export function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d; }
export function manifestAt(src) {
  directory(src);
  const manifest = JSON.parse(regular(path.join(src, 'MANIFEST.json')));
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('manifest has no files');
  const seen = new Set();
  for (const f of manifest.files) {
    if (!f || !/^(offer-watch\/[A-Za-z0-9._-]+|audit\/[A-Za-z0-9._-]+)$/.test(f.path) || ['.', '..'].includes(path.basename(f.path)) || seen.has(f.path)) throw new Error('bad or duplicate manifest path');
    seen.add(f.path);
    directory(path.join(src, path.dirname(f.path)));
    const b = regular(path.join(src, f.path));
    if (sha256(b) !== f.sha256 || b.length !== f.size) throw new Error(`sha256/size mismatch: ${f.path}`);
  }
  return manifest;
}
export function incoming(src, job, today) {
  directory(src);
  if (!['offer', 'audit'].includes(job) || !validDate(today)) throw new Error('invalid job/date');
  const names = fs.readdirSync(src).sort();
  if (!names.length) throw new Error('no incoming state');
  if (job === 'offer' && offerFiles.some(f => !names.includes(f))) throw new Error('missing offer state');
  return names.map(name => {
    if (!(job === 'offer' ? offerFiles.includes(name) : auditPattern.test(name) && name.slice(0, 10) === today)) throw new Error(`disallowed state name: ${name}`);
    const bytes = regular(path.join(src, name));
    if (name.endsWith('.json')) JSON.parse(bytes);
    if (name.endsWith('.jsonl')) for (const line of bytes.toString().split('\n')) if (line.trim()) JSON.parse(line);
    return { name, bytes };
  });
}
export function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('expected --name value');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}
export function outputs(values) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join('')); }
