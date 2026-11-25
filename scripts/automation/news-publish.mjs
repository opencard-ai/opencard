/** Portable live writer, disabled unless all explicit and authoritative gates pass.
 * Invoked by the serialized news-publish workflow. Command execution is injected for tests.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { jsonHash } from './news-portable.mjs';
import { CHECKS_PENDING, mergeVerifiedNewsPr, publishError } from './pr-merge-guard.mjs';

const REPO = 'opencard-ai/opencard';
export const NEWS_REQUIRED_CHECKS = Object.freeze(['validate', 'gitleaks']);
export async function publishPortableNews({ plan, proposed, repoPath, publish = false, productionEnable = false, ownerEpoch, run, fetchLive, fetchDeployment, reconcileExisting = false, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  // These flags alone are insufficient: fresh remote authority and unchanged base required below.
  if (publish !== true || productionEnable !== true || typeof ownerEpoch !== 'string' || !ownerEpoch || typeof fetchDeployment !== 'function') throw publishError('owner_denied', 'production publishing disabled');
  if (typeof plan?.changed !== 'boolean' || plan?.mode !== 'shadow' || !/^[0-9a-f]{40}$/.test(plan.sourceSha ?? '') || !/^news:\d{4}-\d{2}-\d{2}:(morning|evening)$/.test(plan.slotKey ?? '') || plan.proposedSha256 !== jsonHash(proposed) || !Array.isArray(proposed?.items)) throw publishError('invalid_plan', 'invalid shadow artifacts');
  const command = async (cmd, args) => {
    const r = await run(cmd, args);
    if (r.code !== 0) throw publishError('github_query_failed', 'portable news command failed; reconcile before retry');
    return r.stdout;
  };
  const query = async args => { try { return JSON.parse(await command('gh', args)); } catch { throw publishError('github_query_failed', 'GitHub query unavailable'); } };
  const authorize = async () => {
    // Official contents API, read newest main every time; no cached local owner file.
    const file = await query(['api', `repos/${REPO}/contents/ops/runner-owner.json?ref=main`]);
    let authority;
    try { authority = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { throw publishError('owner_denied', 'owner authority unavailable'); }
    if (authority?.version !== 1 || authority.news?.owner !== 'github-actions' || authority.news?.productionEnabled !== true || authority.news?.epoch !== ownerEpoch) throw publishError('owner_denied', 'news owner/enable/epoch denied');
    const ref = await query(['api', `repos/${REPO}/git/ref/heads/main`]);
    if (ref.object?.sha !== plan.sourceSha) throw publishError('base_changed', 'base changed; regenerate shadow before writing');
  };
  await authorize();
  if (!plan.changed) return { state: 'NO_CHANGE' };
  const origin = (await command('git', ['-C', repoPath, 'remote', 'get-url', 'origin'])).trim();
  if (!['https://github.com/opencard-ai/opencard.git', 'https://github.com/opencard-ai/opencard', 'git@github.com:opencard-ai/opencard.git'].includes(origin)) throw publishError('repository_mismatch', 'repository origin mismatch');
  if (!isDeepStrictEqual(plan.allowedFiles, ['data/news.json'])) throw publishError('file_allowlist', 'slot/file identity mismatch');
  const branch = `bot/news-sync/${jsonHash(plan.slotKey).slice(0, 24)}`;
  const superseded = [];
  const mergeAndObserve = async (number, head) => {
    let receipt;
    try {
      receipt = await mergeVerifiedNewsPr({ run, prNumber: number, expectedHead: head, write: true, authorizeWrite: authorize, requiredChecks: NEWS_REQUIRED_CHECKS, sleep });
    } catch (error) {
      // Still a rejection (fail closed, PR left open, nothing merged); identity attached so a caller
      // can distinguish "checks still running" from a real failure and resume with reconcileExisting.
      if (error?.code === CHECKS_PENDING) Object.assign(error, { branch, pr: number, head, superseded });
      throw error;
    }
    const evidence = await observeNewsDeploymentDetailed({ mergeSha: receipt.mergeSha, proposed, run, fetchLive, fetchDeployment });
    return { ...receipt, branch, superseded, deployment: evidence.status, deploymentReason: evidence.reason };
  };
  const existing = await query(['pr', 'list', '--repo', REPO, '--head', branch, '--state', 'all', '--limit', '1000', '--json', 'number,state,headRefOid,mergeCommit']);
  if (!Array.isArray(existing) || existing.length >= 1000) throw publishError('github_query_failed', 'invalid existing PR query');
  // Durable slot dedup is the deterministic branch/PR, not the local date alone.
  const active = existing.filter(p => p.state !== 'CLOSED');
  if (active.length === 1 && active[0].state === 'MERGED') return { state: 'SLOT_ALREADY_PUBLISHED', branch, pr: active[0].number };
  if (reconcileExisting && active.length) {
    if (active.length !== 1 || active[0].state !== 'OPEN') return { state: 'EXISTING_PR_RECONCILE', reason: 'existing_pr_reconcile', branch };
    const head = active[0].headRefOid;
    if (!/^[0-9a-f]{40}$/.test(head ?? '')) throw publishError('head_changed', 'existing PR head unavailable');
    const file = await query(['api', `repos/${REPO}/contents/data/news.json?ref=${head}`]);
    let remote;
    try { remote = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { throw publishError('github_query_failed', 'existing PR payload unavailable'); }
    if (jsonHash(remote) !== plan.proposedSha256) throw publishError('payload_changed', 'existing PR payload differs; manual review required');
    return mergeAndObserve(active[0].number, head);
  }
  if (existing.some(p => !['OPEN', 'CLOSED'].includes(p.state)) || existing.filter(p => p.state === 'OPEN').length > 1) return { state: 'EXISTING_PR_RECONCILE', reason: 'existing_pr_reconcile', branch };
  if (existing.length && existing.every(p => p.state === 'CLOSED') && (await command('git', ['-C', repoPath, 'ls-remote', '--heads', 'origin', branch])).trim()) return { state: 'EXISTING_PR_RECONCILE', reason: 'existing_pr_reconcile', branch };
  const open = await query(['pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '1000', '--json', 'number,headRefName,baseRefName,isDraft,isCrossRepository,author,files,commits,headRefOid,state']);
  if (!Array.isArray(open) || open.length >= 1000) throw publishError('github_query_failed', 'open PR query incomplete');
  const stale = open.filter(p => p.headRefName?.startsWith('bot/news-sync/'));
  // Preflight the entire set before any close: unexpected work always needs a human.
  const eligible = p => /^bot\/news-sync\/[0-9a-f]{24}$/.test(p.headRefName ?? '')
    && Number.isSafeInteger(p.number) && p.number > 0 && p.state === 'OPEN' && p.baseRefName === 'main'
    && p.isDraft === false && p.isCrossRepository === false && p.author?.login === 'opencard-ai'
    && Array.isArray(p.files) && p.files.length === 1 && p.files[0].path === 'data/news.json'
    && Array.isArray(p.commits) && p.commits.length === 1
    && p.commits[0].authors?.some(a => a.email === 'opencard@opencardai.com');
  if (stale.length > 3 || stale.some(p => !eligible(p))) throw publishError('stale_pr_not_supersedable', 'stale news PRs require human review');
  if (existing.some(p => p.state === 'OPEN' && !stale.some(s => s.number === p.number))) throw publishError('another_news_pr_blocking', 'same-slot PR missing from open news query');
  if (reconcileExisting && stale.length) throw publishError('another_news_pr_blocking', 'another news PR is open; reconciliation cannot supersede');
  for (const pr of stale) {
    await authorize();
    await command('gh', ['pr', 'close', String(pr.number), '--repo', REPO, '--delete-branch', '--comment', `Superseded by slot ${plan.slotKey}. News is regenerated from current main; no content lost.`]);
    const closed = await query(['pr', 'view', String(pr.number), '--repo', REPO, '--json', 'state']);
    if (closed.state !== 'CLOSED') throw publishError('stale_pr_not_supersedable', 'stale PR closure unconfirmed');
    superseded.push(pr.number);
  }
  // A remote branch left by push-success/PR-failure must be reconciled, never overwritten.
  if ((await command('git', ['-C', repoPath, 'ls-remote', '--heads', 'origin', branch])).trim()) throw publishError('orphan_branch', 'orphan branch requires reconciliation');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'opencard-news-publish-'));
  const worktree = path.join(scratch, 'worktree');
  try {
  await command('git', ['-C', repoPath, 'worktree', 'add', '--detach', worktree, plan.sourceSha]);
  fs.writeFileSync(path.join(worktree, 'data/news.json'), JSON.stringify(proposed, null, 2) + '\n');
  const git = args => command('git', ['-C', worktree, ...args]);
  const files = (await git(['diff', '--name-only'])).trim().split('\n');
  if (!isDeepStrictEqual(files, ['data/news.json'])) throw publishError('file_allowlist', 'news-only diff guard failed');
  await git(['add', '--', 'data/news.json']);
  await git(['-c', 'user.name=opencard-ai', '-c', 'user.email=opencard@opencardai.com', 'commit', '-m', `chore: automated news sync (${plan.slotKey})`]);
  if ((await git(['log', '-1', '--format=%ae'])).trim() !== 'opencard@opencardai.com') throw publishError('commit_author', 'commit author guard failed');
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  if (!/^[0-9a-f]{40}$/.test(head) || (await git(['rev-list', '--count', `${plan.sourceSha}..HEAD`])).trim() !== '1') throw publishError('commit_count', 'single-commit guard failed');
  await authorize();
  await git(['push', 'origin', `HEAD:refs/heads/${branch}`]);
  await authorize();
  const createdUrl = (await command('gh', ['pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch, '--title', 'chore: automated news sync', '--body', `Automated news sync for slot ${plan.slotKey}. Changes only data/news.json. Auto-merges only when the PR has exactly 1 commit, touches only data/news.json, and the required checks (validate, gitleaks) pass; otherwise it is left open for review.`])).trim();
  const match = /^https:\/\/github\.com\/opencard-ai\/opencard\/pull\/([1-9][0-9]*)$/.exec(createdUrl);
  let number = match ? Number(match[1]) : undefined;
  if (!Number.isSafeInteger(number)) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const created = await query(['pr', 'list', '--repo', REPO, '--head', branch, '--state', 'open', '--json', 'number']);
      if (!Array.isArray(created) || created.length > 1) break;
      if (created.length === 1 && Number.isSafeInteger(created[0].number) && created[0].number > 0) { number = created[0].number; break; }
      if (attempt < 4) await sleep(2000);
    }
  }
  if (!Number.isSafeInteger(number)) throw publishError('pr_creation_unconfirmed', 'PR creation unconfirmed; reconcile before retry');
  // Pending checks fail closed, leaving PR for a future explicit reconcile action.
  // Not an automatic retry loop; no --auto and no fallback to direct-main push.
  return await mergeAndObserve(number, head);
  } finally {
    const removed = await run('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktree]);
    if (removed.code !== 0) throw publishError('worktree_cleanup', 'temporary worktree cleanup failed; reconcile publication before retry');
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** Compatibility API: callers that only need the status retain the string result. */
export async function observeNewsDeployment(options) {
  return (await observeNewsDeploymentDetailed(options)).status;
}

/** Bounded read-only production evidence; transient reads are never definitive failures. */
export async function observeNewsDeploymentDetailed({ mergeSha, proposed, run, fetchLive, fetchDeployment,
  now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 480000, pollMs = 10000 }) {
  const result = (status, reason, attempts) => ({ status, reason, attempts });
  if (!/^[0-9a-f]{40}$/.test(mergeSha ?? '')) return result('UNCONFIRMED', 'invalid_sha', 0);
  if (typeof fetchDeployment !== 'function') return result('UNCONFIRMED', 'api_unavailable', 0);
  const deadline = now() + timeoutMs;
  let attempts = 0;
  // Include a final read at the deadline; the cap also bounds faulty injected clocks.
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / Math.max(1, pollMs)) + 1);
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const r = await run('gh', ['api', `repos/${REPO}/commits/${mergeSha}/status`]);
      if (r.code !== 0) throw new Error();
      const status = JSON.parse(r.stdout);
      if (status.sha !== mergeSha) return result('UNCONFIRMED', 'invalid_sha', attempts);
      if (status.statuses?.some(s => s.context === 'Vercel' && ['failure', 'error'].includes(s.state))) return result('UNCONFIRMED', 'deployment_failed', attempts);
      const deployments = await fetchDeployment(mergeSha);
      const ready = Array.isArray(deployments) && deployments.some(d => d.target === 'production' && d.name === 'opencard' && d.meta?.githubCommitSha === mergeSha && (d.readyState ?? d.state) === 'READY');
      if (ready && status.statuses?.some(s => s.context === 'Vercel' && s.state === 'success')) {
        const response = await fetchLive('https://opencardai.com/en/api/daily-digest?lang=en');
        const expected = { items: proposed.items.map(item => ({ ...item, title: item.title_en || item.title, summary: item.summary_en || '' })), fetched: proposed.fetched };
        if (response.status === 200 && isDeepStrictEqual(response.data, expected)) return result('VERIFIED', 'verified', attempts);
      }
    } catch { /* API/network/JSON failures count as not yet; keep the full observation window. */ }
    if (now() >= deadline || attempts >= maxAttempts) break;
    await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
  }
  return result('UNCONFIRMED', 'timeout', attempts);
}
