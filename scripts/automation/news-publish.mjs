/** Portable live writer, disabled unless all explicit and authoritative gates pass.
 * Manual CLI exists; no workflow invokes it. Command execution is injected for tests.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { jsonHash } from './news-portable.mjs';
import { mergeVerifiedNewsPr } from './pr-merge-guard.mjs';

const REPO = 'opencard-ai/opencard';
export const NEWS_REQUIRED_CHECKS = Object.freeze(['validate', 'gitleaks']);
export async function publishPortableNews({ plan, proposed, repoPath, publish = false, productionEnable = false, ownerEpoch, run, fetchLive, reconcileExisting = false }) {
  // These flags alone are insufficient: fresh remote authority and unchanged base required below.
  if (publish !== true || productionEnable !== true || typeof ownerEpoch !== 'string' || !ownerEpoch) throw new Error('production publishing disabled');
  if (typeof plan?.changed !== 'boolean' || plan?.mode !== 'shadow' || !/^[0-9a-f]{40}$/.test(plan.sourceSha ?? '') || !/^news:[0-9a-f]{40}:\d{4}-\d{2}-\d{2}:(morning|evening)$/.test(plan.slotKey ?? '') || plan.proposedSha256 !== jsonHash(proposed) || !Array.isArray(proposed?.items)) throw new Error('invalid shadow artifacts');
  const command = async (cmd, args) => {
    const r = await run(cmd, args);
    if (r.code !== 0) throw new Error('portable news command failed; reconcile before retry');
    return r.stdout;
  };
  const query = async args => { try { return JSON.parse(await command('gh', args)); } catch { throw new Error('GitHub query unavailable'); } };
  const authorize = async () => {
    // Official contents API, read newest main every time; no cached local owner file.
    const file = await query(['api', `repos/${REPO}/contents/ops/runner-owner.json?ref=main`]);
    let authority;
    try { authority = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { throw new Error('owner authority unavailable'); }
    if (authority?.version !== 1 || authority.news?.owner !== 'github-actions' || authority.news?.productionEnabled !== true || authority.news?.epoch !== ownerEpoch) throw new Error('news owner/enable/epoch denied');
    const ref = await query(['api', `repos/${REPO}/git/ref/heads/main`]);
    if (ref.object?.sha !== plan.sourceSha) throw new Error('base changed; regenerate shadow before writing');
  };
  await authorize();
  if (!plan.changed) return { state: 'NO_CHANGE' };
  const origin = (await command('git', ['-C', repoPath, 'remote', 'get-url', 'origin'])).trim();
  if (!['https://github.com/opencard-ai/opencard.git', 'https://github.com/opencard-ai/opencard', 'git@github.com:opencard-ai/opencard.git'].includes(origin)) throw new Error('repository origin mismatch');
  if (!plan.slotKey.startsWith(`news:${plan.sourceSha}:`) || !isDeepStrictEqual(plan.allowedFiles, ['data/news.json'])) throw new Error('slot/file identity mismatch');
  const branch = `bot/news-sync/${jsonHash(plan.slotKey).slice(0, 24)}`;
  const mergeAndObserve = async (number, head) => {
    const receipt = await mergeVerifiedNewsPr({ run, prNumber: number, expectedHead: head, write: true, authorizeWrite: authorize, requiredChecks: NEWS_REQUIRED_CHECKS });
    return { ...receipt, branch, deployment: await observeNewsDeployment({ mergeSha: receipt.mergeSha, proposed, run, fetchLive }) };
  };
  const existing = await query(['pr', 'list', '--repo', REPO, '--head', branch, '--state', 'all', '--json', 'number,state,headRefOid,mergeCommit']);
  if (!Array.isArray(existing)) throw new Error('invalid existing PR query');
  // Durable slot dedup is the deterministic branch/PR, not the local date alone.
  if (existing.length) {
    if (!reconcileExisting || existing.length !== 1 || existing[0].state !== 'OPEN') return { state: 'EXISTING_PR_RECONCILE', branch, pr: existing[0] };
    const head = existing[0].headRefOid;
    if (!/^[0-9a-f]{40}$/.test(head ?? '')) throw new Error('existing PR head unavailable');
    const file = await query(['api', `repos/${REPO}/contents/data/news.json?ref=${head}`]);
    let remote;
    try { remote = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { throw new Error('existing PR payload unavailable'); }
    if (jsonHash(remote) !== plan.proposedSha256) throw new Error('existing PR payload differs; manual review required');
    return mergeAndObserve(existing[0].number, head);
  }
  const open = await query(['pr', 'list', '--repo', REPO, '--state', 'open', '--json', 'headRefName']);
  if (!Array.isArray(open) || open.some(p => p.headRefName?.startsWith('bot/news-sync/'))) throw new Error('another news PR is open');
  // A remote branch left by push-success/PR-failure must be reconciled, never overwritten.
  if ((await command('git', ['-C', repoPath, 'ls-remote', '--heads', 'origin', branch])).trim()) throw new Error('orphan branch requires reconciliation');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'opencard-news-publish-'));
  const worktree = path.join(scratch, 'worktree');
  await command('git', ['-C', repoPath, 'worktree', 'add', '--detach', worktree, plan.sourceSha]);
  fs.writeFileSync(path.join(worktree, 'data/news.json'), JSON.stringify(proposed, null, 2) + '\n');
  const git = args => command('git', ['-C', worktree, ...args]);
  const files = (await git(['diff', '--name-only'])).trim().split('\n');
  if (!isDeepStrictEqual(files, ['data/news.json'])) throw new Error('news-only diff guard failed');
  await git(['add', '--', 'data/news.json']);
  await git(['-c', 'user.name=opencard-ai', '-c', 'user.email=opencard@opencardai.com', 'commit', '-m', `chore: automated news sync (${plan.slotKey})`]);
  if ((await git(['log', '-1', '--format=%ae'])).trim() !== 'opencard@opencardai.com') throw new Error('commit author guard failed');
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  if (!/^[0-9a-f]{40}$/.test(head) || (await git(['rev-list', '--count', `${plan.sourceSha}..HEAD`])).trim() !== '1') throw new Error('single-commit guard failed');
  await authorize();
  await git(['push', 'origin', `HEAD:refs/heads/${branch}`]);
  await authorize();
  await command('gh', ['pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch, '--title', 'chore: automated news sync', '--body', `Portable news slot: ${plan.slotKey}. Changes only data/news.json. No auto-merge.`]);
  const created = await query(['pr', 'list', '--repo', REPO, '--head', branch, '--state', 'open', '--json', 'number']);
  if (created.length !== 1) throw new Error('PR creation unconfirmed; reconcile before retry');
  // Pending checks fail closed, leaving PR for a future explicit reconcile action.
  // Not an automatic retry loop; no --auto and no fallback to direct-main push.
  return mergeAndObserve(created[0].number, head);
}

/** Read-only evidence after merge; never triggers Vercel deploy or rollback. */
export async function observeNewsDeployment({ mergeSha, proposed, run, fetchLive }) {
  try {
    const r = await run('gh', ['api', `repos/${REPO}/commits/${mergeSha}/status`]);
    if (r.code !== 0) return 'UNCONFIRMED';
    const status = JSON.parse(r.stdout);
    if (status.sha !== mergeSha || !status.statuses?.some(s => s.context === 'Vercel' && s.state === 'success')) return 'UNCONFIRMED';
    const response = await fetchLive('https://opencardai.com/en/api/daily-digest?lang=en');
    const expected = { items: proposed.items.map(item => ({ ...item, title: item.title_en || item.title, summary: item.summary_en || '' })), fetched: proposed.fetched };
    return response.status === 200 && isDeepStrictEqual(response.data, expected) ? 'VERIFIED' : 'UNCONFIRMED';
  } catch { return 'UNCONFIRMED'; }
}
