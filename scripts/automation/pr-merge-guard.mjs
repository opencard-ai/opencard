/** Fail-closed PR merge gate. No auto-merge, polling, push, or implicit write path. */
export const CHECKS_PENDING = 'CHECKS_PENDING';
/** Same fail-closed error, but machine-identifiable as "checks not finished yet" (never as success). */
const pendingError = message => Object.assign(new Error(message), { code: CHECKS_PENDING });
export function assertMergeable({ pr, checks, expectedHead, allowedFile, requiredChecks = ['validate'] }) {
  if (!/^[0-9a-f]{40}$/.test(expectedHead) || pr?.headRefOid !== expectedHead) throw new Error('head changed or invalid');
  if (pr.state !== 'OPEN' || pr.baseRefName !== 'main' || pr.isDraft !== false) throw new Error('PR not open, ready, and targeting main');
  if (!Array.isArray(pr.files) || !pr.files.length || !pr.files.every(f => typeof f.path === 'string' && allowedFile(f.path))) throw new Error('file allowlist failed');
  if (!Array.isArray(checks)) throw new Error('no checks');
  // Failed/cancelled anywhere is a hard failure even while other checks are still pending.
  if (checks.some(c => ['fail', 'cancel'].includes(c?.bucket))) throw new Error('checks not explicitly successful');
  if (!checks.length) throw pendingError('no checks');
  if (checks.some(c => c?.bucket === 'pending')) throw pendingError('checks not explicitly successful');
  if (!checks.every(c => c.bucket === 'pass' && c.state === 'SUCCESS')) throw new Error('checks not explicitly successful');
  // A required check that has not been registered yet is treated as still pending; callers bound the wait.
  if (!requiredChecks.length) throw new Error('required check missing');
  if (!requiredChecks.every(n => checks.some(c => c.name === n))) throw pendingError('required check missing');
}

/** `run` is injected; callers must explicitly authorize writes. API errors fail closed. */
export async function mergeVerifiedNewsPr({ run, prNumber, expectedHead, write = false, authorizeWrite, requiredChecks = ['validate'] }) {
  if (!write) throw new Error('write authorization required');
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) throw new Error('invalid PR number');
  const repo = 'opencard-ai/opencard';
  const read = async args => {
    const r = await run('gh', args);
    if (r.code !== 0) throw new Error('GitHub query failed');
    try { return JSON.parse(r.stdout); } catch { throw new Error('invalid GitHub JSON'); }
  };
  const viewArgs = ['pr', 'view', String(prNumber), '--repo', repo, '--json', 'headRefOid,files,state,baseRefName,isDraft'];
  const pr = await read(viewArgs);
  const checkArgs = ['pr', 'checks', String(prNumber), '--repo', repo, '--json', 'name,state,bucket'];
  // gh exits 1 with "no checks reported" before any check registers on a fresh PR, and some gh
  // versions exit 8 while checks are pending. Only those two cases are tolerated (and only as data
  // that assertMergeable then classifies as pending); every other non-zero exit stays a hard failure.
  const readChecks = async () => {
    const r = await run('gh', checkArgs);
    if (r.code === 8) {
      let parsed;
      try { parsed = JSON.parse(r.stdout); } catch { throw new Error('invalid GitHub JSON'); }
      if (!Array.isArray(parsed)) throw new Error('invalid GitHub JSON');
      return parsed;
    }
    if (r.code !== 0 && /no checks reported/.test(r.stderr ?? '')) return [];
    if (r.code !== 0) throw new Error('GitHub query failed');
    try { return JSON.parse(r.stdout); } catch { throw new Error('invalid GitHub JSON'); }
  };
  const gate = (current, checks) => assertMergeable({ pr: current, checks, expectedHead, requiredChecks, allowedFile: f => f === 'data/news.json' });
  gate(pr, await readChecks());
  const freshPr = await read(viewArgs);
  gate(freshPr, await readChecks()); // Fresh checks too: a rerun can invalidate earlier success.
  if (authorizeWrite) await authorizeWrite();
  const merged = await run('gh', ['pr', 'merge', String(prNumber), '--repo', repo, '--squash', '--delete-branch', '--match-head-commit', expectedHead]);
  if (merged.code !== 0) throw new Error('merge failed');
  // A command acknowledgement is not evidence of a completed merge.
  const receipt = await read(['pr', 'view', String(prNumber), '--repo', repo, '--json', 'state,mergeCommit']);
  if (receipt.state !== 'MERGED' || !/^[0-9a-f]{40}$/.test(receipt.mergeCommit?.oid ?? '')) throw new Error('merge unconfirmed; reconcile remotely before retry');
  return { state: 'MERGED', mergeSha: receipt.mergeCommit.oid };
}
