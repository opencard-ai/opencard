/** Weekly card-database audit (read-only for card data).
 *   npm run -s audit:weekly
 * Runs url-check (official sources) + db-audit, writes artifacts/audit/<today>-*.json/.md,
 * compares against the most recent earlier db-audit report, and prints a short
 * Traditional Chinese summary of NEW high/medium findings only, or NO_REPLY.
 * A lock file prevents overlapping runs. Exits 0 on success, 1 on failure. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createFileAuditStore } from './file-audit-store';
import { sandboxAuditStoreFromEnv } from './upstash-audit-transport';
import type { AuditStore } from './durable-baseline';
import { AUDIT_DOC, NeedsReconciliationError, runWithDurableBaseline } from './durable-baseline';

const requireFromHere = createRequire(path.join(process.cwd(), 'package.json'));

type Finding = { card_id: string; type: string; severity: 'high' | 'medium' | 'low'; field?: string; detail: string; popular?: boolean };
// OPENCARD_AUDIT_DIR relocates report history/baseline (default unchanged: artifacts/audit).
const DIR = process.env.OPENCARD_AUDIT_DIR ? process.env.OPENCARD_AUDIT_DIR.replace(/\/+$/, '') : 'artifacts/audit';
// Fixture runs use a separate lock so they can never make a live run skip.
const LOCK = path.join(os.tmpdir(), process.env.OPENCARD_AUDIT_URLCHECK_FIXTURE ? 'opencard-audit-weekly-fixture.lock' : 'opencard-audit-weekly.lock');
const LOCK_STALE_MS = 3 * 60 * 60 * 1000;
const MAX_CHARS = 1800;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

const TYPE_ZH: Record<string, string> = {
  broken_source_url: '官方來源網址失效 (404)', source_redirects_elsewhere: '來源網址被轉址到其他頁面', missing_sources: '缺少來源',
  no_official_source: '沒有官方來源', duplicate_credit: '重複的年度禮遇', credit_frequency_mismatch: '禮遇頻率與說明不符',
  discontinued_signal_without_status: '疑似停發但未標記', discontinued_with_offer: '停發卡仍顯示開卡禮', closed_with_offer: '停發卡仍顯示開卡禮',
  description_mismatch: '開卡禮說明與數值不符', impossible_value: '不合理數值', possible_issuer_change: '可能已更換發卡行',
  network_mismatch: '卡組織不符', wrong_issuer_reference: '文字提到錯誤的發卡行', value_inconsistent: '估值與點數不一致',
  expired_still_elevated: '優惠已過期仍標記加碼', duplicate_card_entry: '重複的卡片條目', schema_type: '欄位格式錯誤',
  currency_mismatch: '點數/哩程/現金單位不符', stale_benefit: '已結束的福利', fee_text_mismatch: '年費文字與欄位不符',
};

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
/** Test-only: OPENCARD_AUDIT_URLCHECK_FIXTURE replaces the live url-check with a committed fixture.
 *  Accepted only for scripts/audit/fixtures/*.url-check.json and only with OPENCARD_AUDIT_DIR set,
 *  so fixture results can never land in the default artifacts/audit history. Unset = live url-check. */
function urlCheckFixture(): string | null {
  const raw = process.env.OPENCARD_AUDIT_URLCHECK_FIXTURE;
  if (!raw) return null;
  if (!process.env.OPENCARD_AUDIT_DIR) throw new Error('url-check fixture requires OPENCARD_AUDIT_DIR (never the default artifacts dir)');
  const allowed = fs.realpathSync(path.join(process.cwd(), 'scripts/audit/fixtures'));
  const real = fs.realpathSync(raw);
  if (path.dirname(real) !== allowed || !real.endsWith('.url-check.json')) throw new Error('url-check fixture must be scripts/audit/fixtures/*.url-check.json');
  const doc = JSON.parse(fs.readFileSync(real, 'utf8'));
  if (doc.fixture !== true || !Array.isArray(doc.results)) throw new Error('url-check fixture must declare fixture:true and results[]');
  // Fixture output must go to an EXISTING directory whose real path is outside the repo checkout.
  let outDir: string;
  try { outDir = fs.realpathSync(process.env.OPENCARD_AUDIT_DIR); } catch { throw new Error('fixture run requires an existing OPENCARD_AUDIT_DIR'); }
  const repo = fs.realpathSync(process.cwd());
  if (outDir === repo || outDir.startsWith(repo + path.sep)) throw new Error('fixture run may not target a directory inside the repo (incl. artifacts/audit)');
  const tmp = fs.realpathSync(os.tmpdir());
  if (tmp === repo || tmp.startsWith(repo + path.sep)) throw new Error('fixture run requires TMPDIR outside the repo (lock and scratch live there)');
  return real;
}
const key = (f: Finding) => `${f.type}|${f.card_id}|${f.field || ''}|${f.detail.replace(/\s+/g, ' ').trim()}`;

function audit(): Finding[] {
  // Write into a scratch dir and only promote to artifacts/ once the run is
  // known-good, so an aborted run never leaves half-updated reports behind.
  let cur: Finding[] | null = null;
  let fixture: string | null = null;
  const before = sha('data/cards');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'opencard-audit-'));
  try {
    const urlOut = `${stage}/${today}-url-check.json`;
    fixture = urlCheckFixture();
    if (fixture) { fs.copyFileSync(fixture, urlOut); console.error(`audit:weekly: FIXTURE url-check ${path.basename(fixture)} (no network)`); }
    else run(['scripts/audit/url-check.ts', '--official-only', '--out', urlOut]);
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
      // Fixture runs publish with O_EXCL ('wx'): never follow or replace an existing file/symlink.
      fs.writeFileSync(path.join(DIR, f), fs.readFileSync(path.join(stage, f), 'utf8').split(`${stage}/`).join(`${DIR}/`), fixture ? { flag: 'wx' } : undefined);
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }

  return cur ?? JSON.parse(fs.readFileSync(`${DIR}/${today}-db-audit.json`, 'utf8')).findings as Finding[];
}

async function main(): Promise<number> {
  let locked = false;
  try {
    // Validate fixture guards (incl. TMPDIR containment) before the lock or any scratch write.
    if (process.env.OPENCARD_AUDIT_URLCHECK_FIXTURE) urlCheckFixture();
    const durable = process.env.OPENCARD_AUDIT_DURABLE;
    let durableDir: string | undefined;
    let makeStore: (() => AuditStore) | undefined;
    if (durable !== undefined && durable.startsWith('sandbox-redis:')) {
      // Opt-in audit-only SANDBOX Redis (independent audit-state namespace). Production is never enabled here.
      const loop = process.env.OPENCARD_AUDIT_REDIS_ALLOW_LOOPBACK;
      if (loop !== undefined && (loop !== '1' || !process.env.OPENCARD_AUDIT_URLCHECK_FIXTURE)) throw new Error('loopback redis only allowed in fixture mode');
      if (process.env.OPENCARD_AUDIT_FIXTURE_FAULT !== undefined) throw new Error('fixture fault not supported for sandbox-redis');
      const opts = { allowLoopback: loop === '1' };
      sandboxAuditStoreFromEnv(process.env, `weekly_${process.pid}`, opts); // validate config before lock/audit
      makeStore = () => sandboxAuditStoreFromEnv(process.env, `weekly_${process.pid}`, opts);
      durableDir = 'sandbox-redis';
    } else if (durable !== undefined) {
      if (!durable.startsWith('fixture-file:')) throw new Error('unsupported durable store');
      if (!process.env.OPENCARD_AUDIT_URLCHECK_FIXTURE) throw new Error('durable fixture store requires OPENCARD_AUDIT_URLCHECK_FIXTURE');
      urlCheckFixture();
      durableDir = durable.slice('fixture-file:'.length);
      const fault = process.env.OPENCARD_AUDIT_FIXTURE_FAULT;
      if (fault !== undefined && fault !== 'cas-after-commit') throw new Error('unsupported fixture fault');
      // Validate before running the audit or writing artifacts.
      createFileAuditStore(durableDir, `weekly_${process.pid}`);
      const dir = durableDir;
      makeStore = () => createFileAuditStore(dir, `weekly_${process.pid}`, 60000, { faultAfterCasCommit: process.env.OPENCARD_AUDIT_FIXTURE_FAULT === 'cas-after-commit' });
    }
    if (!acquireLock()) { console.error(`audit:weekly: another run holds ${LOCK}`); console.log(durableDir ? 'DURABLE:NO_REPLY' : 'NO_REPLY'); return 0; }
    locked = true;
    // Baseline = most recent db-audit report from an earlier date (read before today's run overwrites anything).
    const reports = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /^\d{4}-\d{2}-\d{2}-db-audit\.json$/.test(f)).sort() : [];
    const prevFile = [...reports].reverse().find(f => f.slice(0, 10) < today) || null;
    const prev: Finding[] | null = !durableDir && prevFile ? JSON.parse(fs.readFileSync(path.join(DIR, prevFile), 'utf8')).findings : null;

    const cur = durableDir ? [] : audit();
    let durableFresh: Finding[] | undefined, previousDate = prevFile?.slice(0, 10);
    if (durableDir) {
      const result = await runWithDurableBaseline(makeStore!(), today, async () => audit(), { docName: AUDIT_DOC });
      const label = { BASELINE_CREATED: 'BASELINE_RECORDED', REPORT: 'CALLER_MUST_SEND', ALREADY_REPORTED: 'ALREADY_REPORTED', NO_REPLY: 'NO_REPLY' }[result.kind];
      console.log(`DURABLE:${label}`);
      if (result.kind !== 'REPORT') return 0;
      durableFresh = result.fresh; previousDate = result.previousDate;
    }
    if (!durableFresh && !prev) { console.log('NO_REPLY'); console.error(`audit:weekly: no earlier report; baseline is ${DIR}/${today}-db-audit.json`); return 0; }
    const prevKeys = new Set((prev || []).map(key));
    const fresh = durableFresh ?? cur.filter(f => (f.severity === 'high' || f.severity === 'medium') && !prevKeys.has(key(f)));
    if (fresh.length === 0) { console.log('NO_REPLY'); return 0; }

    const high = fresh.filter(f => f.severity === 'high').length;
    const lines: string[] = [`📋 OpenCard 每週資料庫稽核 (${today})：新增 ${fresh.length} 項問題 (高 ${high}、中 ${fresh.length - high})，對比 ${previousDate}。`];
    const byType = new Map<string, Finding[]>();
    for (const f of fresh) (byType.get(f.type) || byType.set(f.type, []).get(f.type)!).push(f);
    const sorted = [...byType.entries()].sort((a, b) => Number(b[1][0].severity === 'high') - Number(a[1][0].severity === 'high') || b[1].length - a[1].length);
    for (const [t, fs_] of sorted) {
      lines.push(`\n【${fs_[0].severity === 'high' ? '高' : '中'}】${TYPE_ZH[t] || t}（${fs_.length}）`);
      for (const f of fs_.slice(0, 5)) lines.push(`• ${f.popular ? '⭐' : ''}${f.card_id}：${f.detail.slice(0, 110)}`);
      if (fs_.length > 5) lines.push(`• …另 ${fs_.length - 5} 項`);
    }
    lines.push(`\n完整報告：${DIR}/${today}-db-audit.md`);
    let msg = lines.join('\n');
    if (msg.length > MAX_CHARS) {
      const tail = `\n…（已截斷）完整報告：${DIR}/${today}-db-audit.md`;
      msg = msg.slice(0, MAX_CHARS - tail.length).replace(/\n[^\n]*$/, '') + tail;
    }
    console.log(msg);
    return 0;
  } catch (e) {
    console.error(`audit:weekly failed: ${e instanceof Error ? e.message : String(e)}`);
    // Distinct non-zero code so cron records the data-changed abort as a failure.
    return e instanceof NeedsReconciliationError ? 3 : e instanceof DataChangedError ? 2 : 1;
  } finally {
    if (locked) fs.rmSync(LOCK, { force: true });
  }
}
void main().then(code => { process.exitCode = code; });
