/** One full offer-watch day, safe to run from cron.
 *   npm run -s offer-watch:daily [-- --dry-run | --no-publish] [--state-dir DIR] [--digest] [--skip-pull] [--today YYYY-MM-DD]
 * --no-publish (PR #94 design, phase 1 "hold-only"): like a normal run it persists the ledger/history/daily-state and
 * prints the summary of new holds/failures, but it NEVER edits card files and NEVER runs publish: apply runs with
 * --record-holds, so changes that would be auto-applied are recorded as holds (no_publish_mode). Exit 1 if data/cards
 * changed during the run. --state-dir DIR keeps ledger.json/history.jsonl/daily-state.json in DIR (e.g. an ops-state
 * checkout); only allowed with --dry-run or --no-publish because publish.ts still uses the default paths.
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
import { createHash } from 'node:crypto';
import type { Candidate } from './gate';
import { allFetchesFailed, buildDailySummary, isMonday, newFetchFailures, newHolds, type StepFailure } from './daily-core';
import { DEFAULT_HISTORY, DEFAULT_LEDGER, laToday, loadLedger, readHistory } from './state';

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const dryRun = has('--dry-run');
const noPublish = has('--no-publish');
const stateDirArg = arg('--state-dir');
if (dryRun && noPublish) { console.error('offer-watch daily: --dry-run and --no-publish are mutually exclusive'); process.exit(2); }
if (has('--state-dir') && (!stateDirArg || stateDirArg.startsWith('--'))) { console.error('offer-watch daily: --state-dir needs a directory'); process.exit(2); }
if (stateDirArg && !dryRun && !noPublish) { console.error('offer-watch daily: --state-dir is only allowed with --dry-run or --no-publish'); process.exit(2); }
if (stateDirArg && !fs.existsSync(stateDirArg)) { console.error('offer-watch daily: --state-dir must be an existing directory'); process.exit(2); }
const today = arg('--today') || laToday();
const dir = 'artifacts/offer-watch';
fs.mkdirSync(dir, { recursive: true });
const stateDir = stateDirArg ? path.resolve(stateDirArg) : dir;
const ledgerFile = stateDirArg ? path.join(stateDir, 'ledger.json') : DEFAULT_LEDGER;
const historyFile = stateDirArg ? path.join(stateDir, 'history.jsonl') : DEFAULT_HISTORY;
const logFile = path.join(dir, `daily-${today}.log`);
const lockFile = path.join(dir, 'daily.lock');
const stateFile = path.join(stateDir, 'daily-state.json');
/** Content hash of data/cards/*.json (names + bytes; apply only writes these). --no-publish compares it around apply (after any git pull). */
const cardsHash = () => { const h = createHash('sha256'); for (const f of fs.readdirSync('data/cards').filter(f => f.endsWith('.json')).sort()) h.update(f).update('\0').update(fs.readFileSync(path.join('data/cards', f))); return h.digest('hex'); };
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
  if (!lock.ok) { log(`another daily run holds the lock: ${JSON.stringify(lock.holder)}; exiting`); console.log('NO_REPLY'); return 0; }
  process.on('exit', releaseLock);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { releaseLock(); process.exit(130); });

  const runStart = new Date().toISOString();
  log(`===== offer-watch daily ${today}${dryRun ? ' (dry-run)' : noPublish ? ' (no-publish)' : ''} pid ${process.pid} =====`);
  const ledgerBefore = loadLedger(ledgerFile);
  const failures: StepFailure[] = [];
  const tsx = ['tsx'];
  const cand = path.join(dir, `candidates-${today}.json`), review = path.join(dir, `review-${today}.json`), applyOut = path.join(dir, `apply-${today}.json`);
  const run = (name: string, cmd: string, args: string[], timeoutMs: number, detail: string) => { const ok = step(name, cmd, args, timeoutMs); if (!ok) failures.push({ step: name, detail }); return ok; };

  let ok = has('--skip-pull') || run('git pull', 'git', ['pull', '--ff-only'], 120000, 'git pull --ff-only 失敗，本次未更新資料');
  ok = ok && run('collect', 'npx', [...tsx, 'scripts/offer-watch/collect.ts', '--today', today, '--out', cand], 30 * 60000, 'collect 失敗');
  ok = ok && run('review', 'npx', [...tsx, 'scripts/offer-watch/review.ts', cand, '--worktree', '--ledger', ledgerFile, ...(dryRun ? [] : ['--write']), '--today', today, '--out', review], 5 * 60000, 'review 失敗');
  const planFile = dryRun ? path.join(dir, `apply-${today}.dry.json`) : noPublish ? path.join(dir, `apply-${today}.nopublish.json`) : applyOut;
  const applyMode = dryRun ? [] : noPublish ? ['--record-holds'] : ['--apply'];
  const cardsBefore = noPublish && ok ? cardsHash() : '';
  ok = ok && run('apply', 'npx', [...tsx, 'scripts/offer-watch/apply.ts', '--report', review, '--today', today, '--ledger', ledgerFile, '--history', historyFile, ...applyMode, '--out', planFile], 10 * 60000, 'apply 失敗（卡片檔案已還原）');
  const plan = ok ? readJson<any>(planFile) : null;
  if (noPublish && cardsBefore && cardsHash() !== cardsBefore) { ok = false; failures.push({ step: 'no-publish guard', detail: 'data/cards 在 --no-publish 執行中被修改；未發布，請人工檢查' }); log('no-publish guard: data/cards changed during run'); }
  if (ok && !dryRun && !noPublish && plan?.applied?.length) run('publish', 'npx', [...tsx, 'scripts/offer-watch/publish.ts', '--plan', applyOut], 75 * 60000, 'publish 失敗（詳見 log；失敗時已自動回滾）');
  else if (ok) log(dryRun ? 'dry-run: publish skipped' : noPublish ? 'no-publish: publish skipped (holds recorded)' : 'nothing applied; publish skipped');

  let digest: string | null = null;
  if (has('--digest') || isMonday(today)) {
    if (step('digest', 'npx', [...tsx, 'scripts/offer-watch/digest.ts', '--today', today, '--ledger', ledgerFile, '--history', historyFile], 2 * 60000)) {
      try { digest = fs.readFileSync(path.join(dir, `digest-${today}.md`), 'utf8'); } catch {}
    } else failures.push({ step: 'digest', detail: 'digest 產生失敗' });
  }

  const candidates = readJson<Candidate[]>(cand) || [];
  const state = readJson<{ fetch_failures?: Record<string, string[]> }>(stateFile) || {};
  const failingNow = allFetchesFailed(candidates);
  if (!dryRun && candidates.length) fs.writeFileSync(stateFile, `${JSON.stringify({ updated: new Date().toISOString(), fetch_failures: failingNow }, null, 2)}\n`);
  const events = readHistory(historyFile).filter(e => e.ts >= runStart);
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
