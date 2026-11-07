/** Fail-closed PR merge gate. No auto-merge, polling, push, or implicit write path. */
export function assertMergeable({ pr, checks, expectedHead, allowedFile, requiredChecks = ['validate'] }) {
  if (!/^[0-9a-f]{40}$/.test(expectedHead) || pr?.headRefOid !== expectedHead) throw new Error('head changed or invalid');
  if (pr.state !== 'OPEN' || pr.baseRefName !== 'main' || pr.isDraft !== false) throw new Error('PR not open, ready, and targeting main');
  if (!Array.isArray(pr.files) || !pr.files.length || !pr.files.every(f => typeof f.path === 'string' && allowedFile(f.path))) throw new Error('file allowlist failed');
  if (!Array.isArray(checks) || !checks.length) throw new Error('no checks');
  if (!checks.every(c => c.bucket === 'pass' && c.state === 'SUCCESS')) throw new Error('checks not explicitly successful');
  if (!requiredChecks.length || !requiredChecks.every(n => checks.some(c => c.name === n))) throw new Error('required check missing');
}

/** `run` is injected; callers must explicitly authorize writes. API errors fail closed. */
export async function mergeVerifiedNewsPr({ run, prNumber, expectedHead, write = false }) {
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
  const checks = await read(['pr', 'checks', String(prNumber), '--repo', repo, '--json', 'name,state,bucket']);
  const gate = current => assertMergeable({ pr: current, checks, expectedHead, allowedFile: f => f === 'data/news.json' });
  gate(pr);
  gate(await read(viewArgs)); // Fresh head/file validation after checks; merge itself uses SHA CAS.
  const merged = await run('gh', ['pr', 'merge', String(prNumber), '--repo', repo, '--squash', '--delete-branch', '--match-head-commit', expectedHead]);
  if (merged.code !== 0) throw new Error('merge failed');
  // A command acknowledgement is not evidence of a completed merge.
  const receipt = await read(['pr', 'view', String(prNumber), '--repo', repo, '--json', 'state,mergeCommit']);
  if (receipt.state !== 'MERGED' || !/^[0-9a-f]{40}$/.test(receipt.mergeCommit?.oid ?? '')) throw new Error('merge unconfirmed; reconcile remotely before retry');
  return { state: 'MERGED', mergeSha: receipt.mergeCommit.oid };
}
