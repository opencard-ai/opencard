/** Publish logic with injectable side effects (git / vercel / fetch) so rollback paths are testable. Never force-pushes. */
import type { HistoryEvent, LedgerUpdate } from './state';

export interface RunResult { code: number; stdout: string; stderr: string }
export interface PublishDeps {
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
export interface PublishResult { status: 'published' | 'nothing_to_publish' | 'precondition_failed' | 'checks_failed' | 'push_failed' | 'deploy_failed' | 'live_check_failed'; detail?: string; commits: Array<{ card_id: string; sha: string }>; reverted: string[]; deployment?: string | null; live?: Record<string, string[]>; events: HistoryEvent[]; ledger: LedgerUpdate[] }

const short = (v: unknown) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
export function commitMessage(card: AppliedCard): { subject: string; body: string } {
  const parts = card.changes.map(c => `${c.field.replace('welcome_offer.', '')} ${short(c.old_value)} -> ${short(c.new_value)}`);
  let subject = `offer-watch(${card.card_id}): ${parts.join(', ')}`;
  if (subject.length > 100) subject = `${subject.slice(0, 97)}...`;
  const body = [...card.changes.map(c => `- ${c.field}: ${JSON.stringify(c.old_value)} -> ${JSON.stringify(c.new_value)}`), '', `Official sources: ${card.sources.join(' , ')}`,
    'Auto-applied by scripts/offer-watch: >=2 independent official fetches, sanity + schema guards, validate/tests/build passed.'].join('\n');
  return { subject, body };
}

/** Strings that must appear on the live card page for the new values. */
export function expectedLiveStrings(card: any): string[] {
  const out: string[] = [];
  const offer = card?.welcome_offer || {};
  if (typeof offer.bonus_points === 'number' && offer.bonus_points > 0) out.push(`${offer.bonus_points.toLocaleString('en-US')} pts`);
  if (typeof offer.spending_requirement === 'number' && offer.spending_requirement > 0) out.push(`Spend $${offer.spending_requirement.toLocaleString('en-US')} within ${offer.time_period_months || 3} months`);
  if (typeof card?.annual_fee === 'number') out.push(`$${card.annual_fee.toLocaleString('en-US')} Annual Fee`);
  return out;
}
export const pageText = (html: string) => html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/<!-- -->/g, '').replace(/\s+/g, ' ').replace(/\$ (\d)/g, '$$$1');

export function parseVercelState(output: string): 'ready' | 'error' | 'pending' | 'unknown' {
  if (/●\s*Ready|\bREADY\b/i.test(output)) return 'ready';
  if (/●\s*(Error|Canceled)|\bERROR\b|\bCANCELED\b/i.test(output)) return 'error';
  if (/●\s*(Building|Queued|Initializing)|\bBUILDING\b|\bQUEUED\b|\bINITIALIZING\b/i.test(output)) return 'pending';
  return 'unknown';
}

export async function publish(applied: AppliedCard[], cfg: PublishConfig, deps: PublishDeps): Promise<PublishResult> {
  const events: HistoryEvent[] = []; const ledger: LedgerUpdate[] = [];
  const ts = () => deps.now().toISOString();
  const result = (status: PublishResult['status'], extra: Partial<PublishResult> = {}): PublishResult => ({ status, commits: [], reverted: [], events, ledger, ...extra });
  const failAll = (type: HistoryEvent['type'], detail: string, commits: Array<{ card_id: string; sha: string }> = [], reverted: string[] = []) => {
    for (const card of applied) {
      events.push({ ts: ts(), type, card_id: card.card_id, changes: card.changes.map(({ field, old_value, new_value }) => ({ field, old_value, new_value })), reasons: [detail], commit: commits.find(c => c.card_id === card.card_id)?.sha ?? null, revert_commits: reverted });
      card.changes.forEach(c => ledger.push({ key: c.fingerprint, card_id: card.card_id, field: c.field, value: c.new_value, status: type === 'rolled_back' ? 'rolled_back' : 'publish_failed', failure: `${type}: ${detail}`, commit: commits.find(x => x.card_id === card.card_id)?.sha ?? null }));
    }
  };
  if (!applied.length) return result('nothing_to_publish');
  const git = (...args: string[]) => deps.run('git', args);
  const files = applied.map(a => a.file);

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  if (branch !== cfg.branch) return result('precondition_failed', { detail: `not on ${cfg.branch} (on ${branch})` });
  const changed = git('status', '--porcelain', '--', ...files).stdout.split('\n').filter(Boolean).map(l => l.slice(3).trim());
  const missing = files.filter(f => !changed.includes(f));
  if (missing.length) return result('precondition_failed', { detail: `planned files not modified: ${missing.join(', ')}` });
  const startSha = git('rev-parse', 'HEAD').stdout.trim();

  for (const check of cfg.checks) {
    deps.log(`check: ${check.join(' ')}`);
    const res = deps.run(check[0], check.slice(1));
    if (res.code !== 0) {
      git('checkout', '--', ...files); // no commit was made; restore the card files
      failAll('checks_failed', `${check.join(' ')} exited ${res.code}`);
      return result('checks_failed', { detail: `${check.join(' ')} failed: ${(res.stderr || res.stdout).slice(-500)}` });
    }
  }

  const commits: Array<{ card_id: string; sha: string }> = [];
  for (const card of applied) {
    const { subject, body } = commitMessage(card);
    git('add', '--', card.file);
    const res = git('commit', '-m', subject, '-m', body, '--', card.file);
    if (res.code !== 0) { failAll('push_failed', `commit failed for ${card.card_id}: ${res.stderr.slice(-300)}`, commits); return result('push_failed', { commits, detail: 'commit failed' }); }
    commits.push({ card_id: card.card_id, sha: git('rev-parse', 'HEAD').stdout.trim() });
  }

  const push = () => git('push', cfg.remote, cfg.branch);
  let pushed = push();
  if (pushed.code !== 0) {
    const rebase = git('pull', '--rebase', '--autostash', cfg.remote, cfg.branch);
    if (rebase.code === 0) {
      // SHAs change after rebase: re-read them in order.
      const shas = git('rev-list', '--reverse', `${cfg.remote}/${cfg.branch}..HEAD`).stdout.split('\n').filter(Boolean).slice(-commits.length);
      shas.forEach((sha, i) => { commits[i].sha = sha; });
      pushed = push();
    }
  }
  if (pushed.code !== 0) {
    failAll('push_failed', `push rejected: ${pushed.stderr.slice(-300)}`, commits);
    return result('push_failed', { commits, detail: `push failed; local commits since ${startSha} left unpushed for review` });
  }

  const rollback = async (type: 'deploy_failed' | 'live_check_failed', detail: string) => {
    const shas = commits.map(c => c.sha).reverse();
    const rev = git('revert', '--no-edit', ...shas);
    const revPush = rev.code === 0 ? push() : rev;
    const reverted = rev.code === 0 ? git('rev-list', '--reverse', `${startSha}..HEAD`).stdout.split('\n').filter(Boolean).slice(-shas.length) : [];
    failAll('rolled_back', `${type}: ${detail}${revPush.code === 0 ? '' : ' (revert push FAILED — manual attention needed)'}`, commits, reverted);
    return result(type, { commits, reverted, detail });
  };

  const headSha = commits[commits.length - 1].sha;
  let state: ReturnType<typeof parseVercelState> = 'unknown'; let deployment: string | null = null;
  const deployDeadline = deps.now().getTime() + cfg.deployTimeoutMs;
  while (deps.now().getTime() < deployDeadline) {
    const out = deps.run('vercel', ['ls', cfg.vercelProject, '--scope', cfg.vercelScope, '--prod', '-m', `githubCommitSha=${headSha}`]);
    state = parseVercelState(`${out.stdout}\n${out.stderr}`);
    deployment = (out.stdout.match(/https:\/\/\S+\.vercel\.app/) || [null])[0];
    if (state === 'ready' || state === 'error') break;
    await deps.sleep(cfg.deployPollMs);
  }
  if (state !== 'ready') return rollback('deploy_failed', state === 'error' ? `Vercel deployment for ${headSha} failed` : `Vercel deployment for ${headSha} not Ready within ${cfg.deployTimeoutMs / 60000} min`);

  const live: Record<string, string[]> = {};
  const liveDeadline = deps.now().getTime() + cfg.liveTimeoutMs;
  let allOk = false;
  while (!allOk && deps.now().getTime() < liveDeadline) {
    allOk = true;
    for (const card of applied) {
      const expected = expectedLiveStrings(deps.readCard(card.file));
      const page = await deps.fetchText(`${cfg.siteBase}/en/cards/${card.card_id}?ow=${Date.now()}`).catch(() => ({ status: 0, text: '' }));
      const text = pageText(page.text);
      live[card.card_id] = expected.filter(s => page.status !== 200 || !text.includes(s));
      if (live[card.card_id].length) allOk = false;
    }
    if (!allOk) await deps.sleep(cfg.livePollMs);
  }
  if (!allOk) return rollback('live_check_failed', `live page missing: ${JSON.stringify(live)}`);

  for (const card of applied) {
    const sha = commits.find(c => c.card_id === card.card_id)!.sha;
    events.push({ ts: ts(), type: 'published', card_id: card.card_id, changes: card.changes.map(({ field, old_value, new_value }) => ({ field, old_value, new_value })), sources: card.sources, commit: sha });
    card.changes.forEach(c => ledger.push({ key: c.fingerprint, card_id: card.card_id, field: c.field, value: c.new_value, status: 'published', commit: sha, published_at: ts() }));
  }
  return result('published', { commits, deployment, live });
}
