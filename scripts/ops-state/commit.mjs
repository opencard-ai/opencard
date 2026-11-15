import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { args, manifestAt, incoming, directory, sha256, outputs } from './core.mjs';
export function gitRunner(repo, argv, env = {}) {
  const r = spawnSync('git', ['-C', repo, ...argv], { encoding: 'utf8', env: { ...process.env, ...env } });
  if (r.error || r.status !== 0) throw new Error(`git ${argv[0]} failed (status ${r.status}, signal ${r.signal}): ${r.error?.message || r.stderr}`);
  return r.stdout.trim();
}
export function commitState(a, git = gitRunner) {
  outputs({ committed: false, skipped: false, commit_sha: '' });
  const repo = a.repo;
  const head = git(repo, ['rev-parse', 'HEAD']);
  const manifest = manifestAt(repo);
  if (manifest.runs?.[a.job]?.last_run_id === a['run-id']) {
    console.log('already committed'); outputs({ committed: false, skipped: true, commit_sha: head }); return { committed: false, skipped: true, commit_sha: head };
  }
  if (head !== a['base-sha']) throw Object.assign(new Error('ops-state moved concurrently; base SHA differs; state not written; investigate'), { exitCode: 3 });
  if (!/^\d+$/.test(a['run-id']) || !/^[1-9]\d*$/.test(a.attempt) || !/^[A-Za-z0-9._-]+$/.test(a.epoch)) throw new Error('invalid run metadata');
  const files = incoming(a.from, a.job, a['pt-date']);
  // Refuse unrelated staged/unstaged files: this checkout is exclusively for the state write.
  if (git(repo, ['status', '--porcelain'])) throw new Error('state checkout is not clean');
  const dir = a.job === 'offer' ? 'offer-watch' : 'audit';
  fs.mkdirSync(path.join(repo, dir), { recursive: true }); directory(path.join(repo, dir));
  for (const { name, bytes } of files) {
    const rel = `${dir}/${name}`, dest = path.join(repo, rel);
    try { if (!fs.lstatSync(dest).isFile()) throw new Error(`not regular: ${rel}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const index = manifest.files.findIndex(f => f.path === rel), old = manifest.files[index];
    const hash = sha256(bytes);
    const entry = { ...(old || {}), path: rel, sha256: hash, size: bytes.length };
    if (!old || old.sha256 !== hash || old.size !== bytes.length) for (const k of ['mac_sha256', 'source', 'modified', 'urls_stripped']) delete entry[k];
    fs.writeFileSync(dest, bytes);
    if (index < 0) manifest.files.push(entry); else manifest.files[index] = entry;
  }
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  manifest.runs = { ...manifest.runs, [a.job]: { last_run_id: a['run-id'], last_run_attempt: a.attempt, pt_date: a['pt-date'], writer_epoch: a.epoch, base_sha: a['base-sha'] } };
  fs.writeFileSync(path.join(repo, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // Ensure both allowlisted directories exist for git's pathspec, even on a minimal seed.
  for (const d of ['offer-watch', 'audit']) fs.mkdirSync(path.join(repo, d), { recursive: true });
  git(repo, ['add', '-A', 'offer-watch', 'audit', 'MANIFEST.json']);
  const identity = { GIT_AUTHOR_NAME: 'github-actions[bot]', GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com', GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com' };
  git(repo, ['commit', '-m', `state(${a.job === 'offer' ? 'offer-watch' : 'weekly-audit'}): ${a['pt-date']} run ${a['run-id']} attempt ${a.attempt}`], identity);
  const sha = git(repo, ['rev-parse', 'HEAD']);
  try { git(repo, ['push', 'origin', 'HEAD:refs/heads/ops-state']); }
  catch (e) {
    const detail = e.message.replace(/https?:\/\/[^@\s]+@/g, '');
    throw Object.assign(new Error(`ops-state moved concurrently; state not written; investigate: ${detail}`), { exitCode: 4 });
  }
  const result = { committed: true, skipped: false, commit_sha: sha }; outputs(result); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { commitState(args(process.argv.slice(2))); } catch (e) { console.error(e.message); process.exitCode = e.exitCode || 2; }
}
