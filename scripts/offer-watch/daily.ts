import { capturePublicationBinding, assertPublicationBinding } from './publication-binding';
import { isOfferCli } from './cli-entry';
/** One full offer-watch day, safe to run from cron.
 *   npm run -s offer-watch:daily [-- --dry-run] [--digest] [--skip-pull] [--today YYYY-MM-DD]
 *   (or: scripts/offer-watch/daily.sh)
 * Steps (PT date D): git pull --ff-only -> collect -> review --ledger --write -> apply --apply -> publish (only if something
 * was applied) -> digest (Mondays PT, or --digest). --dry-run: no ledger writes, no card edits, no publish.
 * Lock: artifacts/offer-watch/daily.lock (a live holder -> print NO_REPLY and exit 0; a dead/foreign holder -> lock reclaimed).
 * Log: artifacts/offer-watch/daily-D.log (all step output). stdout: ONLY the summary (Traditional Chinese, <1800 chars) of
 * new changes / new holds / failures, or NO_REPLY when nothing is new. Exit 1 when any step failed (summary still printed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Candidate } from './gate';
import { allFetchesFailed, buildDailySummary, isMonday, newFetchFailures, newHolds, type StepFailure } from './daily-core';
import { DEFAULT_HISTORY, DEFAULT_LEDGER, laToday, loadLedger, readHistory } from './state';

function legacyDailyCli() {
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const dryRun = has('--dry-run');
const today = arg('--today') || laToday();
// Fail before collect/review/apply or artifact/state writes on a future merge unless explicitly provisioned.
const publicationArgs = ['--publish', '--production-enable'].filter(has);
for (const flag of ['--owner-epoch', '--run-id', '--journal-dir']) { const value = arg(flag); if (value) publicationArgs.push(flag, value); }
if (!dryRun) {
  const preflight = spawnSync('npx', ['tsx', 'scripts/offer-watch/publish.ts', '--preflight', ...publicationArgs], { encoding: 'utf8', timeout: 60000 });
  if (preflight.status !== 0) { console.error('offer daily disabled before collect/review/apply: provision guarded publisher first; no rollback assumed'); process.exit(1); }
}
const dir = 'artifacts/offer-watch';
fs.mkdirSync(dir, { recursive: true });
const logFile = path.join(dir, `daily-${today}.log`);
const lockFile = path.join(dir, 'daily.lock');
const stateFile = path.join(dir, 'daily-state.json');
const ptNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' });
const log = (message: string) => fs.appendFileSync(logFile, `[${ptNow()} PT] ${message}\n`);

// ---------- lock
function pidAlive(pid: number) { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } }
function pidIsDaily(pid: number) { try { return /daily\.ts/.test(execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })); } catch { return false; } }
function acquireLock(): { ok: true } | { ok: false; holder: any } {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), today }));
      fs.closeSync(fd);
      return { ok: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let holder: any = {};
      try { holder = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch {}
      if (holder.pid && pidAlive(holder.pid) && pidIsDaily(holder.pid)) return { ok: false, holder };
      log(`reclaiming stale lock ${JSON.stringify(holder)}`);
      fs.rmSync(lockFile, { force: true });
    }
  }
  return { ok: false, holder: { reason: 'lock_race' } };
}
const releaseLock = () => { try { if (JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid === process.pid) fs.rmSync(lockFile); } catch {} };

// ---------- steps (output streamed to the log file)
function step(name: string, cmd: string, args: string[], timeoutMs: number): boolean {
  log(`$ ${[cmd, ...args].join(' ')}`);
  const fd = fs.openSync(logFile, 'a');
  const started = Date.now();
  const res = spawnSync(cmd, args, { stdio: ['ignore', fd, fd], timeout: timeoutMs, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  fs.closeSync(fd);
  const code = res.status ?? (res.signal ? `signal ${res.signal}` : 'unknown');
  log(`${name}: exit ${code} in ${Math.round((Date.now() - started) / 1000)}s`);
  if (res.error) log(`${name}: ${res.error.message}`);
  return res.status === 0;
}
const readJson = <T>(file: string): T | null => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; } };

function main(): number {
  const lock = acquireLock();
  if (lock.ok === false) { log(`another daily run holds the lock: ${JSON.stringify(lock.holder)}; exiting`); console.log('NO_REPLY'); return 0; }
  process.on('exit', releaseLock);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { releaseLock(); process.exit(130); });

  const runStart = new Date().toISOString();
  log(`===== offer-watch daily ${today}${dryRun ? ' (dry-run)' : ''} pid ${process.pid} =====`);
  const ledgerBefore = loadLedger(DEFAULT_LEDGER);
  const failures: StepFailure[] = [];
  const tsx = ['tsx'];
  const cand = path.join(dir, `candidates-${today}.json`), review = path.join(dir, `review-${today}.json`), applyOut = path.join(dir, `apply-${today}.json`);
  const run = (name: string, cmd: string, args: string[], timeoutMs: number, detail: string) => { const ok = step(name, cmd, args, timeoutMs); if (!ok) failures.push({ step: name, detail }); return ok; };

  let ok = has('--skip-pull') || run('git pull', 'git', ['pull', '--ff-only'], 120000, 'git pull --ff-only 失敗，本次未更新資料');
  ok = ok && run('collect', 'npx', [...tsx, 'scripts/offer-watch/collect.ts', '--today', today, '--out', cand], 30 * 60000, 'collect 失敗');
  ok = ok && run('review', 'npx', [...tsx, 'scripts/offer-watch/review.ts', cand, '--worktree', '--ledger', ...(dryRun ? [] : ['--write']), '--today', today, '--out', review], 5 * 60000, 'review 失敗');
  ok = ok && run('apply', 'npx', [...tsx, 'scripts/offer-watch/apply.ts', '--report', review, '--today', today, ...(dryRun ? ['--out', path.join(dir, `apply-${today}.dry.json`)] : ['--apply', '--out', applyOut])], 10 * 60000, 'apply 失敗（卡片檔案已還原）');
  const plan = ok ? readJson<any>(dryRun ? path.join(dir, `apply-${today}.dry.json`) : applyOut) : null;
  if (ok && !dryRun && plan?.applied?.length) run('publish', 'npx', [...tsx, 'scripts/offer-watch/publish.ts', '--plan', applyOut, ...publicationArgs], 75 * 60000, 'publish 失敗或未確認（詳見 log；不可假定已回滾，須相同 run-id reconcile）');
  else if (ok) log(dryRun ? 'dry-run: publish skipped' : 'nothing applied; publish skipped');

  let digest: string | null = null;
  if (has('--digest') || isMonday(today)) {
    if (step('digest', 'npx', [...tsx, 'scripts/offer-watch/digest.ts', '--today', today], 2 * 60000)) {
      try { digest = fs.readFileSync(path.join(dir, `digest-${today}.md`), 'utf8'); } catch {}
    } else failures.push({ step: 'digest', detail: 'digest 產生失敗' });
  }

  const candidates = readJson<Candidate[]>(cand) || [];
  const state = readJson<{ fetch_failures?: Record<string, string[]> }>(stateFile) || {};
  const failingNow = allFetchesFailed(candidates);
  if (!dryRun && candidates.length) fs.writeFileSync(stateFile, `${JSON.stringify({ updated: new Date().toISOString(), fetch_failures: failingNow }, null, 2)}\n`);
  const events = readHistory(DEFAULT_HISTORY).filter(e => e.ts >= runStart);
  const summary = buildDailySummary({
    today, events, stepFailures: failures,
    holds: newHolds(plan, ledgerBefore),
    fetchFailures: newFetchFailures(failingNow, state.fetch_failures || {}), digest,
    planned: dryRun ? (plan?.applied || []) : undefined,
  });
  log(`summary (${summary.length} chars):\n${summary}`);
  log(`===== done${failures.length ? ` with ${failures.length} failure(s)` : ''} =====`);
  console.log(summary);
  return failures.length ? 1 : 0;
}

process.exitCode = main();

}
if (isOfferCli(import.meta.url)) legacyDailyCli();

/** Real sandbox daily entry: shared stages/state; no default adapter, credentials, or operational command. */
export async function runSandboxDaily(options: {
  enabled?: boolean;
  io: import('./sandbox-state').OfferStateIO;
  today: string; slot: 'morning' | 'evening' | 'daily'; attemptId: string; now: number;
  heartbeatMs: number; entries: import('./collect').WatchEntry[]; registry: Set<string>; officialDomains: string[];
  fetch: Parameters<typeof import('./collect').collectState>[1]['fetch'];
  validate(signal: AbortSignal): Promise<boolean>;
  asyncRun(cmd: string, args: string[], signal: AbortSignal, context: { cwd: string }): Promise<{ code: number; cwd: string }>;
  publish?: boolean; productionEnable?: boolean; ownerEpoch?: string;
  publisher: Omit<import('./publish-core').PublishDeps, 'transport' | 'readCard'>;
  config: import('./publish-core').PublishConfig;
  fetchDeployments: Parameters<typeof import('./pr-transport').createOfferPrTransport>[0]['fetchDeployments'];
}) {
  if (options.enabled !== true || !options.io || options.publish !== true || options.productionEnable !== true || !options.ownerEpoch) throw new Error('sandbox daily disabled/incomplete; NO legacy file fallback');
  const [{ collectState }, { reviewState }, { applyState }, { digestState }, { offerRunIdentity }, { leaseHeartbeat }, { createOfferPrTransport }, { publish }, { createHash }] = await Promise.all([
    import('./collect'), import('./review'), import('./apply'), import('./digest'), import('./run-identity'), import('./lease-heartbeat'), import('./pr-transport'), import('./publish-core'), import('node:crypto'),
  ]);
  if (options.io.leaseTtlMs && options.heartbeatMs > Math.floor(options.io.leaseTtlMs / 3)) throw new Error('heartbeat must renew within one third of lease TTL');
  const { io } = options, identity = offerRunIdentity(options.today, options.slot, options.attemptId);
  await io.lease.acquire();
  const heartbeat = leaseHeartbeat(io.lease, options.heartbeatMs);
  const cardDigest = () => createHash('sha256').update(JSON.stringify([...io.cards()].sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
  try {
    const transport = createOfferPrTransport({ ...options, run: options.publisher.run, publish: true, productionEnable: true, runId: identity.runId, store: io.journal, lease: heartbeat });
    await transport.authorize();
    const initial = await io.read();
    const checkpoint = initial.value.daily.runs?.[identity.runId];
    let applied = checkpoint?.applied;
    if (!applied) {
      const candidates = await collectState(io, { entries: options.entries, runAt: new Date(options.now).toISOString(), fetch: options.fetch, today: options.today, officialDomains: options.officialDomains });
      await heartbeat.assert();
      const report = await reviewState(io, candidates, options);
      await heartbeat.assert();
      const plan = await applyState(io, report, { ...options, runId: identity.runId, signal: heartbeat.signal });
      applied = plan.applied;
      const state = await io.read();
      await io.cas(state.version, { ...state.value, daily: { ...state.value.daily, updated: new Date(options.now).toISOString(), fetch_failures: allFetchesFailed(candidates) } });
    } else {
      // Scratch/artifacts are disposable. Resume from authoritative plan, not yesterday's local output.
      const cards = io.cards();
      const { isDeepStrictEqual } = await import('node:util');
      for (const card of applied) {
        const current = cards.get(card.card_id), before = checkpoint?.cardsBefore?.[card.card_id], after = checkpoint?.cardsAfter?.[card.card_id];
        if (!before || !after || (!isDeepStrictEqual(current, before) && !isDeepStrictEqual(current, after))) throw new Error('resume complete baseline changed/missing; reconcile manually');
        cards.set(card.card_id, structuredClone(after));
      }
      await io.putCards(cards);
    }
    await heartbeat.assert();
    // Long validation/build is ASYNC and heartbeat keeps running. Bind receipt to exact scratch cards.
    // Never run synchronous build checks inside publish() while pretending a timer can renew.
    if (options.config.checks.length === 0) throw new Error('explicit nonempty validation/build check list required');
    const validatedDigest = cardDigest();
    const base = options.publisher.run('git', ['rev-parse', 'HEAD']);
    if (base.code !== 0 || !/^[0-9a-f]{40}$/.test(base.stdout.trim())) throw new Error('validation base SHA unavailable');
    const binding = capturePublicationBinding(io.publicationRoot, base.stdout.trim(), applied, io.cardBytes);
    assertPublicationBinding(options.publisher.run, binding, { base: true });
    for (const check of options.config.checks) {
      await heartbeat.assert();
      const result = await options.asyncRun(check[0], check.slice(1), heartbeat.signal, { cwd: io.publicationRoot });
      await heartbeat.assert();
      if (result.cwd !== io.publicationRoot || result.code !== 0 || cardDigest() !== validatedDigest || options.publisher.run('git', ['rev-parse', 'HEAD']).stdout.trim() !== base.stdout.trim()) throw new Error('async check failed or validation input changed');
    }
    assertPublicationBinding(options.publisher.run, binding, { base: true });
    await transport.authorize();
    const boundTransport = createOfferPrTransport({ ...options, run: options.publisher.run, publish: true, productionEnable: true, runId: identity.runId, store: io.journal, lease: heartbeat, validation: binding });
    const result = await publish(applied, { ...options.config, checks: [] }, { ...options.publisher, transport: boundTransport, validation: binding, readCard: file => io.cards().get(path.basename(file, '.json')) });
    await heartbeat.assert();
    const state = await io.read();
    const history = [...state.value.history];
    for (const event of result.events) if (!history.some(e => e.type === event.type && e.card_id === event.card_id && e.commit === event.commit)) history.push(event);
    await io.cas(state.version, { ...state.value, ledger: (await import('./state')).upsertLedger(state.value.ledger, result.ledger, new Date(options.now).toISOString()), history, daily: { ...state.value.daily, runs: { ...state.value.daily.runs, [identity.runId]: { ...state.value.daily.runs?.[identity.runId], runId: identity.runId, phase: result.status, applied } } } });
    const digest = await digestState(io, options.today);
    return { result, digest, runId: identity.runId, attemptId: identity.attemptId };
  } finally {
    await heartbeat.stop();
    try { await io.lease.release(); } catch { /* do not steal/reacquire a poisoned session */ }
  }
}
