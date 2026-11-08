import { assertPublicationBinding, type PublicationBinding } from './publication-binding';
/** Actual fixed repo PR helper. No direct-main/revert-push fallback. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assertMergeable } from '../automation/pr-merge-guard.mjs';
import type { OfferJournal, OfferJournalStore } from './publish-journal';
export interface CommandResult { code: number; stdout: string; stderr?: string }
export interface OfferReceipt { state: 'merged' | 'uncertain'; mergeSha?: string; detail?: string }
export interface OfferPrTransport {
  authorize(): Promise<void>;
  reconcile(files: string[], fingerprints: string[]): Promise<OfferReceipt | null>;
  merge(startSha: string, files: string[]): Promise<OfferReceipt>;
  rollback(mergeSha: string, files: string[]): Promise<OfferReceipt>;
  deployment(mergeSha: string): Promise<{ state: 'ready' | 'error' | 'pending' | 'unknown'; id?: string }>;
  record(phase: string, fields?: Partial<OfferJournal>): boolean | Promise<boolean>;
}
const REPO = 'opencard-ai/opencard';
const AUTHOR = 'opencard@opencardai.com';
const sha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
export const isCardFile = (file: string) => /^data\/cards\/[A-Za-z0-9._-]+\.json$/.test(file);
export function createOfferPrTransport(options: {
  run(cmd: string, args: string[]): CommandResult;
  publish: boolean; productionEnable: boolean; ownerEpoch?: string; runId?: string;
  store: OfferJournalStore;
  lease?: { assert(): Promise<void> };
  validation?: PublicationBinding;
  fetchDeployments(mergeSha: string): Promise<Array<{ uid?: string; createdAt?: number; created?: number; name?: string; target?: string; meta?: { githubCommitSha?: string }; readyState?: string; state?: string }>>;
}): OfferPrTransport {
  const { run, store } = options;
  let journal: OfferJournal | null = null;
  let activeBinding = options.validation;
  const cmd = (command: string, args: string[]) => { const r = run(command, args); if (r.code !== 0) throw new Error('PR helper command failed; reconcile required'); return r.stdout; };
  const query = (args: string[]) => { try { return JSON.parse(cmd('gh', args)); } catch { throw new Error('GitHub evidence unavailable'); } };
  const authorize = async () => {
    if (activeBinding) assertPublicationBinding(run, activeBinding);
    if (options.publish !== true || options.productionEnable !== true || !options.ownerEpoch || !/^[A-Za-z0-9_-]{1,100}$/.test(options.runId ?? '')) throw new Error('offer publication disabled');
    const file = query(['api', `repos/${REPO}/contents/ops/runner-owner.json?ref=main`]);
    let owner;
    try { owner = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { throw new Error('offer authority unavailable'); }
    if (owner.version !== 1 || owner.offer?.owner !== 'github-actions' || owner.offer?.productionEnabled !== true || owner.offer?.epoch !== options.ownerEpoch) throw new Error('offer owner/enable/epoch denied');
    if (options.lease) await options.lease.assert();
  };
  const writeBoundary = async () => {
    await authorize();
    if (activeBinding) {
      const main = query(['api', `repos/${REPO}/git/ref/heads/main`]);
      if (main.object?.sha !== activeBinding.baseSha) throw new Error('validated authoritative main changed');
      assertPublicationBinding(run, activeBinding);
    }
    // GitHub has no atomic owner/lease/base fencing with this write: reconcile receipts, never claim exactly-once.
  };
  const record = async (phase: string, fields: Partial<OfferJournal> = {}) => {
    if (!journal) return false;
    journal = { ...journal, ...fields, phase };
    try { await store.save(journal); return true; } catch { return false; }
  };
  const branch = (rollback = false) => `bot/offer-watch${rollback ? '-rollback' : ''}/${createHash('sha256').update(options.runId ?? '').digest('hex').slice(0, 24)}`;
  const view = (number: number) => query(['pr', 'view', String(number), '--repo', REPO, '--json', 'headRefOid,files,state,baseRefName,isDraft,mergeCommit']);
  const remoteBytes = (head: string) => {
    if (!activeBinding) return;
    const tree = query(['api', `repos/${REPO}/git/trees/${head}?recursive=1`]);
    if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new Error('remote validated tree unavailable');
    // Compare the COMPLETE remote blob tree against validated base + exact planned bytes.
    const baseTree = cmd('git', ['ls-tree', '-r', '-z', activeBinding.baseSha]);
    const expected = new Map(baseTree.split('\0').filter(Boolean).map(entry => {
      const match = /^(\d+) (blob|commit) ([0-9a-f]{40})\t(.+)$/.exec(entry);
      if (!match) throw new Error('validated base tree unavailable');
      return [match[4], `${match[1]} ${match[2]} ${match[3]}`];
    }));
    for (const [file, oid] of Object.entries(activeBinding.files)) {
      if (!expected.has(file)) throw new Error('planned card absent from validated base');
      expected.set(file, `100644 blob ${oid}`);
    }
    const remote = tree.tree.filter((entry: { type: string }) => entry.type !== 'tree');
    if (remote.length !== expected.size || remote.some((entry: { path: string; mode: string; type: string; sha: string }) => expected.get(entry.path) !== `${entry.mode} ${entry.type} ${entry.sha}`) || new Set(remote.map((entry: { path: string }) => entry.path)).size !== expected.size) throw new Error('complete remote tree differs from validated base/plan');
    for (const [file, oid] of Object.entries(activeBinding.files)) if (!tree.tree.some((entry: { path: string; sha: string; mode: string; type: string }) => entry.path === file && entry.sha === oid && entry.mode === '100644' && entry.type === 'blob')) throw new Error('remote PR bytes differ from validated plan');
  };
  const validateFiles = (files: string[]) => { if (!files.length || !files.every(isCardFile)) throw new Error('cards-only allowlist failed'); };
  const safeMerge = async (number: number, head: string, files: string[]) => {
    for (let read = 0; read < 2; read++) {
      const pr = view(number);
      const checks = query(['pr', 'checks', String(number), '--repo', REPO, '--json', 'name,state,bucket']);
      assertMergeable({ pr, checks, expectedHead: head, allowedFile: isCardFile, requiredChecks: ['validate', 'gitleaks'] });
      if (!isDeepStrictEqual(pr.files.map((f: { path: string }) => f.path).sort(), [...files].sort())) throw new Error('PR file set changed');
    }
    remoteBytes(head);
    await writeBoundary();
    cmd('gh', ['pr', 'merge', String(number), '--repo', REPO, '--squash', '--delete-branch', '--match-head-commit', head]);
    const receipt = view(number);
    if (receipt.state !== 'MERGED' || receipt.headRefOid !== head || !sha(receipt.mergeCommit?.oid)) throw new Error('merge unconfirmed');
    return receipt.mergeCommit.oid as string;
  };
  const uncertain = async (detail: string): Promise<OfferReceipt> => { await record('uncertain'); return { state: 'uncertain', detail }; };
  return {
    authorize, record,
    reconcile: async (files, fingerprints) => {
      try {
        await authorize(); validateFiles(files);
        if (!fingerprints.length || fingerprints.some(fp => typeof fp !== 'string' || !fp) || new Set(fingerprints).size !== fingerprints.length) return uncertain('nonempty unique fingerprints required');
        journal = await store.load(options.runId!);
        if (journal && (journal.version !== 1 || journal.runId !== options.runId)) return uncertain('journal identity invalid');
        if (journal?.rollbackAttempted || journal?.rollbackHead || journal?.rollbackSha || journal?.phase.startsWith('rollback')) {
          // Query GitHub truth, but never repeat a revert whose intent was already durable.
          const rollbacks = query(['pr', 'list', '--repo', REPO, '--head', branch(true), '--state', 'all', '--json', 'number']);
          if (Array.isArray(rollbacks) && rollbacks.length === 1) {
            const remote = view(rollbacks[0].number);
            if (journal.rollbackHead && remote.headRefOid === journal.rollbackHead && remote.state === 'MERGED' && sha(remote.mergeCommit?.oid)) await record('rollback_reconciled', { rollbackSha: remote.mergeCommit.oid });
          }
          return uncertain('rollback intent irreversible; GitHub truth queried, operator reconciliation required');
        }
        if (journal && (!isDeepStrictEqual([...journal.files].sort(), [...files].sort()) || !isDeepStrictEqual([...journal.fingerprints].sort(), [...fingerprints].sort()))) return uncertain('run identity payload changed');
        const prs = query(['pr', 'list', '--repo', REPO, '--head', branch(), '--state', 'all', '--json', 'number']);
        if (!Array.isArray(prs) || prs.length > 1) return uncertain('ambiguous remote slot');
        if (prs.length) {
          if (!journal || !sha(journal.headSha)) return uncertain('remote PR exists without trusted journal head; do not replay');
          const pr = view(prs[0].number);
          if (pr.headRefOid !== journal.headSha || pr.baseRefName !== 'main' || !isDeepStrictEqual(pr.files.map((f: { path: string }) => f.path).sort(), [...files].sort())) return uncertain('remote payload/head changed');
          remoteBytes(journal.headSha);
          if (pr.state === 'MERGED' && sha(pr.mergeCommit?.oid)) {
            if (!await record('merged', { prNumber: prs[0].number, mergeSha: pr.mergeCommit.oid })) return uncertain('merged remotely but state unavailable');
            return { state: 'merged', mergeSha: pr.mergeCommit.oid };
          }
          if (pr.state !== 'OPEN') return uncertain('closed PR requires operator decision');
          await store.claim(fingerprints, options.runId!);
          const merged = await safeMerge(prs[0].number, journal.headSha, files);
          return await record('merged', { mergeSha: merged }) ? { state: 'merged', mergeSha: merged } : uncertain('merge completed but journal failed');
        }
        const remoteBranch = cmd('git', ['ls-remote', '--heads', 'origin', branch()]).trim();
        if (remoteBranch || (journal?.headSha && journal.pushAttempted !== false)) return uncertain('push/PR uncertain; do not repeat');
        journal = { version: 1, runId: options.runId!, fingerprints, files, phase: 'prepared', pushAttempted: false };
        return await record('prepared') ? null : uncertain('state unavailable before publish');
      } catch { return uncertain('state/remote/authority unavailable; no automatic replay'); }
    },
    merge: async (startSha, files) => {
      let pushAttempted = false;
      try {
        await authorize(); validateFiles(files);
        if (!journal || !isDeepStrictEqual([...journal.files].sort(), [...files].sort()) || !sha(startSha)) return uncertain('journal/helper missing');
        if (options.validation && startSha !== options.validation.baseSha) return uncertain('validated base mismatch');
        const origin = cmd('git', ['remote', 'get-url', 'origin']).trim();
        if (!['https://github.com/opencard-ai/opencard.git', 'https://github.com/opencard-ai/opencard', 'git@github.com:opencard-ai/opencard.git'].includes(origin)) return uncertain('origin mismatch');
        const main = query(['api', `repos/${REPO}/git/ref/heads/main`]);
        if (main.object?.sha !== startSha) return uncertain('main changed before push');
        const diff = cmd('git', ['diff', '--name-only', startSha, 'HEAD']).trim().split('\n').sort();
        if (!isDeepStrictEqual(diff, [...files].sort()) || cmd('git', ['log', '--format=%ae', `${startSha}..HEAD`]).trim().split('\n').some(a => a !== AUTHOR)) return uncertain('commit/file guard failed');
        const head = cmd('git', ['rev-parse', 'HEAD']).trim(); if (!sha(head)) return uncertain('head unavailable');
        if (activeBinding) assertPublicationBinding(run, activeBinding, { commit: head });
        await store.claim(journal.fingerprints, options.runId!);
        if (!await record('push_intent', { headSha: head })) { await store.releaseClaims?.(journal.fingerprints, options.runId!); return uncertain('state unavailable before push'); }
        await authorize();
        if (!await record('push_attempted', { pushAttempted: true })) { await store.releaseClaims?.(journal.fingerprints, options.runId!); return uncertain('state unavailable before issuing push'); }
        if (activeBinding) assertPublicationBinding(run, activeBinding, { commit: head });
        await writeBoundary();
        pushAttempted = true; cmd('git', ['push', 'origin', `${head}:refs/heads/${branch()}`]);
        if (!await record('branch_pushed')) return uncertain('push completed but state failed');
        await writeBoundary(); cmd('gh', ['pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch(), '--title', 'offer-watch: guarded card data update', '--body', `Offer run ${options.runId}; card JSON only; PR-only transport.`]);
        const prs = query(['pr', 'list', '--repo', REPO, '--head', branch(), '--state', 'open', '--json', 'number']);
        if (prs.length !== 1 || !await record('pr_open', { prNumber: prs[0].number })) return uncertain('PR/state unconfirmed');
        const merged = await safeMerge(prs[0].number, head, files);
        return await record('merged', { mergeSha: merged }) ? { state: 'merged', mergeSha: merged } : uncertain('merge completed but state failed');
      } catch {
        if (!pushAttempted && journal) { try { await store.releaseClaims?.(journal.fingerprints, options.runId!); } catch { /* lease/state uncertain: do not force release */ } }
        return uncertain('publication unconfirmed; reconcile same run before any retry');
      }
    },
    rollback: async (merged, files) => {
      try {
        await authorize(); validateFiles(files);
        if (!journal || !isDeepStrictEqual([...journal.files].sort(), [...files].sort()) || !sha(merged) || journal.mergeSha !== merged || journal.rollbackHead || journal.rollbackSha) return uncertain('rollback identity/state uncertain; no repeat');
        if (!await record('rollback_intent', { rollbackAttempted: true })) return uncertain('rollback journal unavailable');
        cmd('git', ['fetch', 'origin', 'main']);
        const rollbackBase = cmd('git', ['rev-parse', 'origin/main']).trim();
        const main = query(['api', `repos/${REPO}/git/ref/heads/main`]);
        if (!sha(rollbackBase) || main.object?.sha !== rollbackBase) return uncertain('rollback base unavailable/changed');
        await authorize(); cmd('git', ['checkout', '--detach', 'origin/main']);
        cmd('git', ['-c', 'user.name=opencard-ai', '-c', `user.email=${AUTHOR}`, 'revert', '--no-edit', merged]);
        const changed = cmd('git', ['diff', '--name-only', 'HEAD^', 'HEAD']).trim().split('\n').sort();
        if (!isDeepStrictEqual(changed, [...files].sort()) || cmd('git', ['log', '-1', '--format=%ae']).trim() !== AUTHOR) return uncertain('revert whitelist/author failed');
        const head = cmd('git', ['rev-parse', 'HEAD']).trim();
        if (activeBinding) {
          const revertFiles = Object.fromEntries(files.map(file => [file, cmd('git', ['rev-parse', '--verify', `${head}:${file}`]).trim()]));
          activeBinding = Object.freeze({ ...activeBinding, baseSha: rollbackBase, files: Object.freeze(revertFiles) });
          assertPublicationBinding(run, activeBinding, { commit: head });
        }
        if (!sha(head) || !await record('rollback_push_intent', { rollbackHead: head })) return uncertain('rollback head/state unavailable');
        await writeBoundary(); cmd('git', ['push', 'origin', `${head}:refs/heads/${branch(true)}`]);
        await writeBoundary(); cmd('gh', ['pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch(true), '--title', 'Revert offer-watch deployment failure', '--body', `Revert actual squash merge ${merged}; run ${options.runId}.`]);
        const prs = query(['pr', 'list', '--repo', REPO, '--head', branch(true), '--state', 'open', '--json', 'number']);
        if (prs.length !== 1 || !await record('rollback_pr', { rollbackPr: prs[0].number })) return uncertain('rollback PR/state unconfirmed');
        const reverted = await safeMerge(prs[0].number, head, files);
        return await record('rolled_back', { rollbackSha: reverted }) ? { state: 'merged', mergeSha: reverted } : uncertain('rollback merge succeeded but state failed');
      } catch { return uncertain('rollback FAILED/UNCERTAIN; manual reconciliation required'); }
    },
    deployment: async merged => {
      try {
        if (!sha(merged)) return { state: 'unknown' };
        const deployments = await options.fetchDeployments(merged);
        const matches = deployments.filter(d => d.name === 'opencard' && d.target === 'production' && d.meta?.githubCommitSha === merged);
        const created = (d: { createdAt?: number; created?: number }) => d.createdAt ?? d.created;
        if (matches.length > 1 && matches.some(d => !Number.isFinite(created(d)))) return { state: 'unknown' };
        matches.sort((a, b) => (created(b) ?? 0) - (created(a) ?? 0));
        if (matches.length > 1 && created(matches[0]) === created(matches[1])) return { state: 'unknown' };
        const match = matches[0];
        if (!match) return { state: 'unknown' };
        const state = match.readyState ?? match.state;
        return { state: state === 'READY' ? 'ready' : ['ERROR', 'CANCELED', 'BLOCKED'].includes(state ?? '') ? 'error' : 'pending', id: match.uid };
      } catch { return { state: 'unknown' }; }
    },
  };
}
