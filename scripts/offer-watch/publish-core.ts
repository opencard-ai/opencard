import { assertPublicationBinding, publicationPlanDigest, type PublicationBinding } from './publication-binding';
/** Publish logic with injectable side effects (git / vercel / fetch) so rollback paths are testable. Never force-pushes. */
import type { HistoryEvent, LedgerUpdate } from './state';
import type { OfferPrTransport } from './pr-transport';
import { formatWelcomeBonus } from '../../lib/welcome-offer';

export interface RunResult { code: number; stdout: string; stderr: string }
export interface PublishDeps {
  transport?: OfferPrTransport;
  validation?: PublicationBinding;
  run(cmd: string, args: string[]): RunResult;
  fetchText(url: string): Promise<{ status: number; text: string }>;
  readCard(file: string): any;
  sleep(ms: number): Promise<void>;
  now(): Date;
  log(message: string): void;
}
export interface PublishConfig {
  branch: string; remote: string; vercelProject: string; vercelScope: string; siteBase: string;
  checks: string[][]; deployTimeoutMs: number; deployPollMs: number; liveTimeoutMs: number; livePollMs: number;
}
export interface AppliedCard { card_id: string; file: string; changes: Array<{ field: string; old_value: unknown; new_value: unknown; fingerprint: string }>; sources: string[] }
export interface PublishResult { status: 'published' | 'nothing_to_publish' | 'precondition_failed' | 'checks_failed' | 'push_failed' | 'deploy_failed' | 'live_check_failed' | 'uncertain'; detail?: string; commits: Array<{ card_id: string; sha: string }>; reverted: string[]; deployment?: string | null; live?: Record<string, string[]>; events: HistoryEvent[]; ledger: LedgerUpdate[] }

const short = (v: unknown) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
export function commitMessage(card: AppliedCard): { subject: string; body: string } {
  const parts = card.changes.map(c => `${c.field.replace('welcome_offer.', '')} ${short(c.old_value)} -> ${short(c.new_value)}`);
  let subject = `offer-watch(${card.card_id}): ${parts.join(', ')}`;
  if (subject.length > 100) subject = `${subject.slice(0, 97)}...`;
  const body = [...card.changes.map(c => `- ${c.field}: ${JSON.stringify(c.old_value)} -> ${JSON.stringify(c.new_value)}`), '', `Official sources: ${card.sources.join(' , ')}`,
    'Auto-applied by scripts/offer-watch: >=2 independent official fetches, sanity + schema guards, validate/tests/build passed.'].join('\n');
  return { subject, body };
}

/** Strings that must appear on the live card page for the new values.
 * Uses the same display unit as the card page (formatWelcomeBonus): "$250" for
 * cash / statement-credit offers, "80,000 pts" for points. Hardcoding "pts"
 * caused 2026-10-22/23 auto-rollbacks of amex-blue-cash-preferred ($300 cash). */
export function expectedLiveStrings(card: any): string[] {
  const out: string[] = [];
  const offer = card?.welcome_offer || {};
  const bonus = formatWelcomeBonus(offer, 'en', 'pts');
  if (bonus) out.push(bonus);
  if (typeof offer.spending_requirement === 'number' && offer.spending_requirement > 0) out.push(`Spend $${offer.spending_requirement.toLocaleString('en-US')} within ${offer.time_period_months || 3} months`);
  if (typeof card?.annual_fee === 'number') out.push(`$${card.annual_fee.toLocaleString('en-US')} Annual Fee`);
  return out;
}

/** Abort live polling early when the page is 200 but the same strings stay missing —
 * a content mismatch will not heal by waiting out the full liveTimeoutMs. */
export const LIVE_MISMATCH_FAIL_FAST = 3;
export const pageText = (html: string) => html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/<!-- -->/g, '').replace(/\s+/g, ' ').replace(/\$ (\d)/g, '$$$1');

export function parseVercelState(output: string): 'ready' | 'error' | 'pending' | 'unknown' {
  if (/●\s*Ready|\bREADY\b/i.test(output)) return 'ready';
  if (/●\s*(Error|Canceled)|\bERROR\b|\bCANCELED\b/i.test(output)) return 'error';
  if (/●\s*(Building|Queued|Initializing)|\bBUILDING\b|\bQUEUED\b|\bINITIALIZING\b/i.test(output)) return 'pending';
  return 'unknown';
}

/** Reconstruct rollback expectations without silently creating absent nested objects. */
export function previousCardValue(card: unknown, changes: AppliedCard['changes']): unknown {
  const previous = structuredClone(card);
  for (const change of changes) {
    const keys = change.field.split('.');
    if (!keys.length || keys.some(k => !k || ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('rollback expectation field invalid');
    let obj = previous as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) {
      if (!obj || typeof obj !== 'object' || !Object.hasOwn(obj, key) || !obj[key] || typeof obj[key] !== 'object' || Array.isArray(obj[key])) throw new Error('rollback expectation missing nested object');
      obj = obj[key] as Record<string, unknown>;
    }
    if (!obj || typeof obj !== 'object') throw new Error('rollback expectation missing nested object');
    obj[keys[keys.length - 1]] = change.old_value;
  }
  return previous;
}

export async function publish(applied: AppliedCard[], cfg: PublishConfig, deps: PublishDeps): Promise<PublishResult> {
  const events: HistoryEvent[] = [], ledger: LedgerUpdate[] = [];
  const commits: Array<{ card_id: string; sha: string }> = [];
  const result = (status: PublishResult['status'], extra: Partial<PublishResult> = {}): PublishResult => ({ status, commits, reverted: [], events, ledger, ...extra });
  if (!applied.length) return result('nothing_to_publish');
  const transport = deps.transport;
  if (!transport) return result('precondition_failed', { detail: 'fixed repo PR helper and private journal required; no direct push fallback' });
  try { await transport.authorize(); } catch { return result('precondition_failed', { detail: 'publication disabled or owner/enable/epoch unavailable' }); }
  const files = applied.map(a => a.file);
  if (new Set(files).size !== files.length || !files.every(f => /^data\/cards\/[A-Za-z0-9._-]+\.json$/.test(f))) return result('precondition_failed', { detail: 'cards-only file allowlist' });
  if (!cfg.checks.length && !deps.validation) return result('precondition_failed', { detail: 'zero synchronous checks require bound external validation receipt' });
  if (deps.validation) {
    const expected = Object.keys(deps.validation.files).sort();
    if (JSON.stringify(expected) !== JSON.stringify([...files].sort()) || expected.some(file => !/^[0-9a-f]{40}$/.test(deps.validation!.files[file])) || publicationPlanDigest(applied, deps.validation.files) !== deps.validation.planDigest) return result('precondition_failed', { detail: 'validated file set/plan changed' });
    try { assertPublicationBinding(deps.run, deps.validation, { base: true }); } catch { return result('precondition_failed', { detail: 'validated worktree/base/bytes mismatch before reconcile' }); }
  }
  const git = (...args: string[]) => deps.run('git', args);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch.code !== 0 || branch.stdout.trim() !== cfg.branch || cfg.branch !== 'main' || cfg.remote !== 'origin') return result('precondition_failed', { detail: 'expected main/origin isolated worktree' });
  const status = git('status', '--porcelain');
  const changed = status.stdout.split('\n').filter(Boolean).map(l => l.slice(3).trim()).sort();
  // Reconciliation can MERGE an existing PR: reject unrelated inputs before entering it.
  if (status.code !== 0 || changed.some(file => !files.includes(file))) return result('precondition_failed', { detail: 'unvalidated staged/untracked worktree input before reconcile' });
  let receipt = await transport.reconcile(files, applied.flatMap(a => a.changes.map(c => c.fingerprint)));
  if (receipt?.state === 'uncertain') return result('uncertain', { detail: receipt.detail });
  if (!receipt) {
    if (JSON.stringify(changed) !== JSON.stringify([...files].sort())) return result('precondition_failed', { detail: 'worktree must contain exactly planned card changes; no staged/untracked state' });
    const start = git('rev-parse', 'HEAD');
    if (start.code !== 0 || !/^[0-9a-f]{40}$/.test(start.stdout.trim())) return result('precondition_failed', { detail: 'base SHA unavailable' });
    if (deps.validation) { try { assertPublicationBinding(deps.run, deps.validation, { base: true }); } catch { return result('precondition_failed', { detail: 'validated worktree/base/bytes mismatch' }); } }
    for (const check of cfg.checks) {
      const res = deps.run(check[0], check.slice(1));
      if (res.code !== 0) return result('checks_failed', { detail: 'validation failed before external publication' });
    }
    if (deps.validation) { try { assertPublicationBinding(deps.run, deps.validation, { base: true }); } catch { return result('precondition_failed', { detail: 'validation bytes changed before staging' }); } }
    for (const card of applied) {
      const { subject, body } = commitMessage(card);
      if (git('add', '--', card.file).code !== 0) return result('push_failed', { detail: 'local stage failed' });
      if (deps.validation) { try { assertPublicationBinding(deps.run, deps.validation, { index: [card.file] }); } catch { return result('precondition_failed', { detail: 'staged publication bytes mismatch' }); } }
      if (git('-c', 'user.name=opencard-ai', '-c', 'user.email=opencard@opencardai.com', 'commit', '-m', subject, '-m', body, '--', card.file).code !== 0) return result('push_failed', { detail: 'local commit failed; no push fallback' });
      if (deps.validation) { try { assertPublicationBinding(deps.run, deps.validation, { commit: 'HEAD', commitFiles: [card.file] }); } catch { return result('precondition_failed', { detail: 'committed publication bytes mismatch' }); } }
    }
    receipt = await transport.merge(start.stdout.trim(), files);
    if (receipt.state !== 'merged') return result('uncertain', { detail: receipt.detail });
  }
  const mergeSha = receipt.mergeSha;
  if (!mergeSha || !/^[0-9a-f]{40}$/.test(mergeSha)) return result('uncertain', { detail: 'missing confirmed squash merge SHA' });
  applied.forEach(card => commits.push({ card_id: card.card_id, sha: mergeSha }));
  const observe = async (sha: string) => {
    const attempts = Math.max(1, Math.ceil(cfg.deployTimeoutMs / Math.max(1, cfg.deployPollMs)));
    let evidence: Awaited<ReturnType<OfferPrTransport['deployment']>> = { state: 'unknown' };
    for (let i = 0; i < attempts; i++) {
      evidence = await transport.deployment(sha);
      if (evidence.state === 'ready' || evidence.state === 'error') break;
      if (i + 1 < attempts) await deps.sleep(cfg.deployPollMs);
    }
    return evidence;
  };
  const verifyLive = async (previous = false) => {
    const live: Record<string, string[]> = {};
    const attempts = Math.max(1, Math.ceil(cfg.liveTimeoutMs / Math.max(1, cfg.livePollMs)));
    let streak = 0, last = '';
    for (let i = 0; i < attempts; i++) {
      let non200 = false;
      for (const card of applied) {
        let value;
        try { value = previous ? previousCardValue(deps.readCard(card.file), card.changes) : deps.readCard(card.file); }
        catch { return { ok: false, live, uncertain: true, detail: 'rollback expectation missing/invalid nested object; public restoration cannot be proven' }; }
        const expected = expectedLiveStrings(value);
        // Empty expectations cannot establish public-page agreement.
        if (!expected.length) return { ok: false, live, uncertain: true };
        const page = await deps.fetchText(`${cfg.siteBase}/en/cards/${card.card_id}?ow=${deps.now().getTime()}`).catch(() => ({ status: 0, text: '' }));
        non200 ||= page.status !== 200;
        live[card.card_id] = expected.filter(s => page.status !== 200 || !pageText(page.text).includes(s));
      }
      if (Object.values(live).every(v => !v.length)) return { ok: true, live, uncertain: false };
      const key = JSON.stringify(live); streak = !non200 && last === key ? streak + 1 : 1; last = key;
      if (!non200 && streak >= LIVE_MISMATCH_FAIL_FAST) return { ok: false, live, uncertain: false };
      if (i + 1 < attempts) await deps.sleep(cfg.livePollMs);
    }
    return { ok: false, live, uncertain: true };
  };
  const rollback = async (reason: 'deploy_failed' | 'live_check_failed') => {
    const reverted = await transport.rollback(mergeSha, files);
    if (reverted.state !== 'merged' || !reverted.mergeSha) return result('uncertain', { detail: 'rollback FAILED/UNCERTAIN; no direct revert push' });
    const restoredDeployment = await observe(reverted.mergeSha);
    if (restoredDeployment.state !== 'ready') return result('uncertain', { reverted: [reverted.mergeSha], detail: 'revert PR merged but production restoration UNCONFIRMED' });
    const restored = await verifyLive(true);
    if (!restored.ok || !await transport.record('rollback_verified', { rollbackSha: reverted.mergeSha })) return result('uncertain', { reverted: [reverted.mergeSha], detail: restored.detail ?? 'rollback page/state UNCONFIRMED' });
    for (const card of applied) {
      events.push({ ts: deps.now().toISOString(), type: 'rolled_back', card_id: card.card_id, commit: mergeSha, revert_commits: [reverted.mergeSha], reasons: [reason] });
      card.changes.forEach(c => ledger.push({ key: c.fingerprint, card_id: card.card_id, field: c.field, value: c.new_value, status: 'rolled_back', commit: mergeSha }));
    }
    return result(reason, { reverted: [reverted.mergeSha], detail: 'revert PR merged and production restoration verified' });
  };
  const deployed = await observe(mergeSha);
  if (!await transport.record('deployment_observed', { deployment: deployed.state })) return result('uncertain', { detail: 'merge/deployment completed but journal failed; reconcile only' });
  if (deployed.state === 'error') return rollback('deploy_failed');
  if (deployed.state !== 'ready') return result('uncertain', { detail: 'production deployment UNCONFIRMED; no automatic rollback assumption' });
  const live = await verifyLive();
  if (!live.ok) return live.uncertain ? result('uncertain', { live: live.live, detail: 'public page unavailable/unconfirmed; no rollback assumption' }) : rollback('live_check_failed');
  if (!await transport.record('published')) return result('uncertain', { detail: 'publication verified but private state failed; reconcile, never republish blindly' });
  for (const card of applied) {
    events.push({ ts: deps.now().toISOString(), type: 'published', card_id: card.card_id, changes: card.changes.map(({ field, old_value, new_value }) => ({ field, old_value, new_value })), sources: card.sources, commit: mergeSha });
    card.changes.forEach(c => ledger.push({ key: c.fingerprint, card_id: card.card_id, field: c.field, value: c.new_value, status: 'published', commit: mergeSha, published_at: deps.now().toISOString() }));
  }
  return result('published', { deployment: deployed.id, live: live.live });
}
