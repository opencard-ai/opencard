/** Fail-closed PR merge gate. No auto-merge, polling, push, or implicit write path. */
export const publishError = (reason, message) => Object.assign(new Error(message), { reason });
export const CHECKS_PENDING = 'CHECKS_PENDING';
/** Same fail-closed error, but machine-identifiable as "checks not finished yet" (never as success). */
const pendingError = message => Object.assign(new Error(message), { code: CHECKS_PENDING });
export function assertMergeable({ pr, checks, expectedHead, allowedFile, requiredChecks = ['validate'] }) {
  if (!/^[0-9a-f]{40}$/.test(expectedHead) || pr?.headRefOid !== expectedHead) throw publishError('head_changed', 'head changed or invalid');
  if (pr.state !== 'OPEN' || pr.baseRefName !== 'main' || pr.isDraft !== false || (pr.isCrossRepository !== undefined && pr.isCrossRepository !== false)) throw publishError('pr_not_ready', 'PR not open, ready, and targeting main');
  if (!Array.isArray(pr.commits) || pr.commits.length !== 1) throw publishError('commit_count', 'exactly one commit required');
  if (!pr.commits[0].authors?.some(a => a.email === 'opencard@opencardai.com')) throw publishError('commit_author', 'commit author guard failed');
  if (!Array.isArray(pr.files) || !pr.files.length || !pr.files.every(f => typeof f.path === 'string' && allowedFile(f.path))) throw publishError('file_allowlist', 'file allowlist failed');
  if (!Array.isArray(checks)) throw publishError('checks_failed', 'no checks');
  // Failed/cancelled anywhere is a hard failure even while other checks are still pending.
  if (checks.some(c => ['fail', 'cancel'].includes(c?.bucket))) throw publishError('checks_failed', 'checks not explicitly successful');
  if (!checks.length) throw pendingError('no checks');
  if (checks.some(c => c?.bucket === 'pending')) throw pendingError('checks not explicitly successful');
  if (!checks.every(c => c.bucket === 'pass' && c.state === 'SUCCESS')) throw publishError('checks_failed', 'checks not explicitly successful');
  // A required check that has not been registered yet is treated as still pending; callers bound the wait.
  if (!requiredChecks.length) throw publishError('checks_failed', 'required check missing');
  if (!requiredChecks.every(n => checks.some(c => c.name === n))) throw pendingError('required check missing');
}

/** `run` is injected; callers must explicitly authorize writes. API errors fail closed. */
export async function mergeVerifiedNewsPr({ run, prNumber, expectedHead, write = false, authorizeWrite, requiredChecks = ['validate'], sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!write) throw new Error('write authorization required');
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) throw new Error('invalid PR number');
  const repo = 'opencard-ai/opencard';
  const read = async (args, retryNotFound = false) => {
    let r;
    for (let attempt = 0; attempt < 5; attempt++) {
      r = await run('gh', args);
      if (r.code === 0 || !retryNotFound || !/no commit found on the pull request|Could not resolve to a (PullRequest|node)/i.test(r.stderr ?? '') || attempt === 4) break;
      await sleep(2000);
    }
    if (r.code !== 0) throw publishError('github_query_failed', 'GitHub query failed');
    try { return JSON.parse(r.stdout); } catch { throw publishError('github_query_failed', 'invalid GitHub JSON'); }
  };
  const viewArgs = ['pr', 'view', String(prNumber), '--repo', repo, '--json', 'headRefOid,files,state,baseRefName,isDraft,isCrossRepository,commits'];
  const pr = await read(viewArgs, true);
  const checkArgs = ['pr', 'checks', String(prNumber), '--repo', repo, '--json', 'name,state,bucket'];
  // gh exits 1 with "no checks reported" before any check registers on a fresh PR, and some gh
  // versions exit 8 while checks are pending. Known fresh-PR not-found errors also mean
  // no checks yet; every other non-zero exit stays a hard failure.
  const readChecks = async () => {
    const r = await run('gh', checkArgs);
    if (r.code !== 0 && /no checks reported|no commit found on the pull request|Could not resolve to a (PullRequest|node)/i.test(r.stderr ?? '')) return [];
    if (r.code === 8) {
      let parsed;
      try { parsed = JSON.parse(r.stdout); } catch { throw publishError('github_query_failed', 'invalid GitHub JSON'); }
      if (!Array.isArray(parsed)) throw publishError('github_query_failed', 'invalid GitHub JSON');
      return parsed;
    }
    if (r.code !== 0) throw publishError('github_query_failed', 'GitHub query failed');
    try { return JSON.parse(r.stdout); } catch { throw publishError('github_query_failed', 'invalid GitHub JSON'); }
  };
  const gate = (current, checks) => assertMergeable({ pr: current, checks, expectedHead, requiredChecks, allowedFile: f => f === 'data/news.json' });
  gate(pr, await readChecks());
  const freshPr = await read(viewArgs);
  gate(freshPr, await readChecks()); // Fresh checks too: a rerun can invalidate earlier success.
  if (authorizeWrite) await authorizeWrite();
  const merged = await run('gh', ['pr', 'merge', String(prNumber), '--repo', repo, '--squash', '--delete-branch', '--author-email', 'opencard@opencardai.com', '--match-head-commit', expectedHead]);
  if (merged.code !== 0) throw publishError('merge_failed', 'merge failed');
  // A command acknowledgement is not evidence of a completed merge.
  const receipt = await read(['pr', 'view', String(prNumber), '--repo', repo, '--json', 'state,mergeCommit']);
  if (receipt.state !== 'MERGED' || !/^[0-9a-f]{40}$/.test(receipt.mergeCommit?.oid ?? '')) throw publishError('merge_unconfirmed', 'merge unconfirmed; reconcile remotely before retry');
  return { state: 'MERGED', mergeSha: receipt.mergeCommit.oid };
}
