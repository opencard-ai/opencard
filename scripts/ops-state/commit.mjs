import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { args, manifestAt, incoming, directory, sha256, outputs } from './core.mjs';
export function gitRunner(repo, argv, env = {}) {
  const r = spawnSync('git', ['-C', repo, ...argv], { encoding: 'utf8', env: { ...process.env, ...env } });
  if (r.error || r.status !== 0) throw new Error(`git ${argv[0]} failed (status ${r.status}, signal ${r.signal}): ${r.error?.message || r.stderr}`);
  return r.stdout.trim();
}
export function concurrentChangeIsSafe(repo, job, base, tip, git = gitRunner) {
  if (!['offer', 'audit'].includes(job) || base === tip) return false;
  const otherJob = job === 'offer' ? 'audit' : 'offer';
  const otherDir = job === 'offer' ? 'audit' : 'offer-watch';
  try {
    git(repo, ['merge-base', '--is-ancestor', base, tip]);
    if (git(repo, ['rev-list', '--merges', `${base}..${tip}`])) return false;
    const paths = git(repo, ['diff', '--no-renames', '--name-only', base, tip]).split('\n').filter(Boolean);
    if (paths.some(p => p !== 'MANIFEST.json' && !p.startsWith(`${otherDir}/`))) return false;
    const stripped = sha => {
      const m = JSON.parse(git(repo, ['show', `${sha}:MANIFEST.json`]));
      if (!Array.isArray(m.files)) throw new Error('manifest lacks files array');
      m.files = m.files.filter(f => !f.path.startsWith(`${otherDir}/`));
      m.runs ??= {};
      if (m.runs) delete m.runs[otherJob];
      return m;
    };
    if (!isDeepStrictEqual(stripped(base), stripped(tip))) return false;
    const prefix = `state(${job === 'offer' ? 'weekly-audit' : 'offer-watch'}): `;
    const botEmail = '41898282+github-actions[bot]@users.noreply.github.com';
    return git(repo, ['log', '--format=%ae%x09%ce%x09%s', `${base}..${tip}`]).split('\n').every(line => {
      const [author, committer, subject] = line.split('\t');
      return author === botEmail && committer === botEmail && subject?.startsWith(prefix);
    });
  } catch { return false; }
}

// Both initial writes and retries validate the tip manifest and apply only this job's incoming state.
function writeCommit(a, files, rebasedOnto, git) {
  const repo = a.repo, manifest = manifestAt(repo);
  const ownDir = a.job === 'offer' ? 'offer-watch' : 'audit';
  fs.mkdirSync(path.join(repo, ownDir), { recursive: true }); directory(path.join(repo, ownDir));
  for (const { name, bytes } of files) {
    const rel = `${ownDir}/${name}`, dest = path.join(repo, rel);
    try { if (!fs.lstatSync(dest).isFile()) throw new Error(`not regular: ${rel}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const index = manifest.files.findIndex(f => f.path === rel), old = manifest.files[index];
    const hash = sha256(bytes);
    const entry = { ...(old || {}), path: rel, sha256: hash, size: bytes.length };
    if (!old || old.sha256 !== hash || old.size !== bytes.length) for (const k of ['mac_sha256', 'source', 'modified', 'urls_stripped']) delete entry[k];
    fs.writeFileSync(dest, bytes);
    if (index < 0) manifest.files.push(entry); else manifest.files[index] = entry;
  }
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  manifest.runs = { ...manifest.runs, [a.job]: { last_run_id: a['run-id'], last_run_attempt: a.attempt, pt_date: a['pt-date'], writer_epoch: a.epoch, base_sha: a['base-sha'], ...(rebasedOnto ? { rebased_onto: rebasedOnto } : {}) } };
  fs.writeFileSync(path.join(repo, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // Ensure both allowlisted directories exist for git's pathspec, even on a minimal seed.
  for (const d of ['offer-watch', 'audit']) fs.mkdirSync(path.join(repo, d), { recursive: true });
  git(repo, ['add', '-A', 'offer-watch', 'audit', 'MANIFEST.json']);
  const identity = { GIT_AUTHOR_NAME: 'github-actions[bot]', GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com', GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com' };
  git(repo, ['commit', '-m', `state(${a.job === 'offer' ? 'offer-watch' : 'weekly-audit'}): ${a['pt-date']} run ${a['run-id']} attempt ${a.attempt}`], identity);
  return git(repo, ['rev-parse', 'HEAD']);
}
export function commitState(a, git = gitRunner) {
  outputs({ committed: false, skipped: false, commit_sha: '', rebased: false });
  const repo = a.repo, base = a['base-sha'];
  let head = git(repo, ['rev-parse', 'HEAD']), rebasedOnto;
  const alreadyCommitted = () => {
    if (manifestAt(repo).runs?.[a.job]?.last_run_id !== a['run-id']) return;
    console.log('already committed');
    const result = { committed: false, skipped: true, commit_sha: head, rebased: !!rebasedOnto };
    outputs(result); return result;
  };
  const skipped = alreadyCommitted();
  if (skipped) return skipped;
  if (!/^\d+$/.test(a['run-id']) || !/^[1-9]\d*$/.test(a.attempt) || !/^[A-Za-z0-9._-]+$/.test(a.epoch)) throw new Error('invalid run metadata');
  const files = incoming(a.from, a.job, a['pt-date']);
  // This checkout is exclusively for state writing; never reset a dirty checkout.
  if (git(repo, ['status', '--porcelain'])) throw new Error('state checkout is not clean');
  const fetchSafeTip = (requireLocalAncestor = false) => {
    // The commit-state checkout needs full history (fetch-depth: 0) so base is available.
    try {
      git(repo, ['fetch', 'origin', 'refs/heads/ops-state']);
      const tip = git(repo, ['rev-parse', 'FETCH_HEAD']);
      if (!concurrentChangeIsSafe(repo, a.job, base, tip, git)) return;
      if (requireLocalAncestor && head !== tip) git(repo, ['merge-base', '--is-ancestor', head, tip]);
      return tip;
    } catch { return; }
  };
  const reset = tip => {
    git(repo, ['reset', '--hard', tip]); head = tip; rebasedOnto = tip;
  };
  // Post-reset alreadyCommitted() checks are defensive; safe changes belong to the other job.
  if (head !== base) {
    const tip = fetchSafeTip(true);
    if (!tip) throw Object.assign(new Error('ops-state moved concurrently; base SHA differs; state not written; investigate (not a safe other-job-only change)'), { exitCode: 3 });
    reset(tip);
    const skipped = alreadyCommitted();
    if (skipped) return skipped;
  }
  let sha = writeCommit(a, files, rebasedOnto, git);
  const pushError = (e, unsafe = false) => {
    const detail = e.message.replace(/https?:\/\/[^@\s]+@/g, '');
    return Object.assign(new Error(`ops-state moved concurrently; state not written; investigate: ${detail}${unsafe ? ' (not a safe other-job-only change)' : ''}`), { exitCode: 4 });
  };
  try { git(repo, ['push', 'origin', 'HEAD:refs/heads/ops-state']); }
  catch (e) {
    if (rebasedOnto) throw pushError(e);
    const tip = fetchSafeTip();
    if (!tip) throw pushError(e, true);
    reset(tip);
    const skipped = alreadyCommitted();
    if (skipped) return skipped;
    sha = writeCommit(a, files, rebasedOnto, git);
    try { git(repo, ['push', 'origin', 'HEAD:refs/heads/ops-state']); }
    catch (second) { throw pushError(second); }
  }
  const result = { committed: true, skipped: false, commit_sha: sha, rebased: !!rebasedOnto }; outputs(result); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { commitState(args(process.argv.slice(2))); } catch (e) { console.error(e.message); process.exitCode = e.exitCode || 2; }
}
