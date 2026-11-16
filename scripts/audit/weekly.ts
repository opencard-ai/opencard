/** Weekly card-database audit (read-only for card data).
 *   npm run -s audit:weekly
 * Runs url-check (official sources) + db-audit, writes artifacts/audit/<today>-*.json/.md,
 * compares against the most recent earlier db-audit report, and prints a short
 * Traditional Chinese summary of new high/medium findings and severity escalations, or NO_REPLY.
 * A lock file prevents overlapping runs. Exits 0 on success, 1 on failure. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Finding } from './finding-key';
import { renderWeeklySummary } from './weekly-summary';

const requireFromHere = createRequire(path.join(process.cwd(), 'package.json'));

// OPENCARD_AUDIT_DIR relocates report history/baseline (default unchanged: artifacts/audit). From draft PR #64.
const DIR = path.resolve(process.env.OPENCARD_AUDIT_DIR || 'artifacts/audit');
if (DIR === path.parse(DIR).root) { console.error('audit:weekly: OPENCARD_AUDIT_DIR must not be the filesystem root'); process.exit(2); }
const LOCK = path.join(os.tmpdir(), 'opencard-audit-weekly.lock');
const LOCK_STALE_MS = 3 * 60 * 60 * 1000;
const overrideToday = process.env.OPENCARD_AUDIT_TODAY;
if (overrideToday !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(overrideToday) || !Number.isFinite(Date.parse(overrideToday)) || new Date(overrideToday).toISOString().slice(0, 10) !== overrideToday)) {
  console.error('audit:weekly: OPENCARD_AUDIT_TODAY must be a valid YYYY-MM-DD date'); process.exit(2);
}
const today = overrideToday ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

function sha(dir: string): string {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f)));
  return h.digest('hex');
}
function acquireLock(): boolean {
  try {
    const fd = fs.openSync(LOCK, 'wx'); fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`); fs.closeSync(fd); return true;
  } catch {
    try {
      const [pidStr] = fs.readFileSync(LOCK, 'utf8').split(' ');
      const age = Date.now() - fs.statSync(LOCK).mtimeMs;
      let alive = false; try { process.kill(Number(pidStr), 0); alive = true; } catch { alive = false; }
      if (!alive || age > LOCK_STALE_MS) { fs.rmSync(LOCK, { force: true }); return acquireLock(); }
    } catch { /* fall through */ }
    return false;
  }
}
function run(args: string[]): void {
  const r = spawnSync(process.execPath, [requireFromHere.resolve('tsx/cli'), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  if (r.status !== 0) throw new Error(`${args.join(' ')} failed (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(-800)}`);
}
class DataChangedError extends Error {}

function main(): number {
  if (!acquireLock()) { console.error(`audit:weekly: another run holds ${LOCK}`); console.log('NO_REPLY'); return 0; }
  try {
    // Baseline = most recent db-audit report from an earlier date (read before today's run overwrites anything).
    const reports = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /^\d{4}-\d{2}-\d{2}-db-audit\.json$/.test(f)).sort() : [];
    const prevFile = [...reports].reverse().find(f => f.slice(0, 10) < today) || null;
    const prev: Finding[] | null = prevFile ? JSON.parse(fs.readFileSync(path.join(DIR, prevFile), 'utf8')).findings : null;

    // Write into a scratch dir and only promote to artifacts/ once the run is
    // known-good, so an aborted run never leaves half-updated reports behind.
    let cur: Finding[] | null = null;
    const before = sha('data/cards');
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'opencard-audit-'));
    try {
      const urlOut = `${stage}/${today}-url-check.json`;
      run(['scripts/audit/url-check.ts', '--official-only', '--out', urlOut]);
      run(['scripts/audit/db-audit.ts', '--today', today, '--urls', urlOut, '--out-dir', stage]);
      if (sha('data/cards') !== before) throw new DataChangedError('data/cards changed during audit; aborting without updating artifacts (rerun when no edits are in progress)');
      fs.mkdirSync(DIR, { recursive: true });
      // Reruns on the same day keep the first saved report so artifacts stay
      // stable; this run is still compared against the last earlier report.
      if (fs.existsSync(path.join(DIR, `${today}-db-audit.json`))) {
        cur = JSON.parse(fs.readFileSync(path.join(stage, `${today}-db-audit.json`), 'utf8')).findings;
        console.error(`audit:weekly: ${DIR}/${today}-db-audit.json already exists; not overwriting`);
      } else for (const f of [`${today}-url-check.json`, `${today}-db-audit.json`, `${today}-db-audit.md`]) {
        // Point references at the promoted location instead of the scratch dir.
        fs.writeFileSync(path.join(DIR, f), fs.readFileSync(path.join(stage, f), 'utf8').split(`${stage}/`).join(`${DIR}/`));
      }
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }

    if (!cur) cur = JSON.parse(fs.readFileSync(`${DIR}/${today}-db-audit.json`, 'utf8')).findings as Finding[];
    if (!prev) { console.log('NO_REPLY'); console.error(`audit:weekly: no earlier report; baseline is ${DIR}/${today}-db-audit.json`); return 0; }
    const msg = renderWeeklySummary(prev, cur, today, prevFile!.slice(0, 10), DIR);
    console.log(msg);
    return 0;
  } catch (e) {
    console.error(`audit:weekly failed: ${e instanceof Error ? e.message : String(e)}`);
    // Distinct non-zero code so cron records the data-changed abort as a failure.
    return e instanceof DataChangedError ? 2 : 1;
  } finally {
    fs.rmSync(LOCK, { force: true });
  }
}
process.exitCode = main();
