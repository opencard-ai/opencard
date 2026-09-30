/** Publish an apply plan: validate/tests/build -> one commit per card -> push main (never force) -> wait for Vercel
 * production Ready -> verify live card pages -> on deploy/live failure git revert + push. Records results in ledger/history.
 *   npx tsx scripts/offer-watch/publish.ts --plan <apply.json> [--dry-run]
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { publish, type PublishConfig } from './publish-core';
import { DEFAULT_HISTORY, DEFAULT_LEDGER, appendHistory, loadLedger, saveLedger, upsertLedger } from './state';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const planFile = arg('--plan');
if (!planFile) throw new Error('--plan <apply.json> is required (output of apply.ts --apply)');
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
if (plan.mode !== 'apply') throw new Error('plan was not produced with --apply');
const unitTests = fs.readdirSync('tests').filter(f => f.endsWith('.test.ts')).map(f => `tests/${f}`);
const cfg: PublishConfig = {
  branch: 'main', remote: 'origin', vercelProject: 'opencard', vercelScope: 'opencard-ais-projects', siteBase: 'https://opencardai.com',
  checks: [['npm', 'run', 'validate'], ['npx', 'tsx', 'scripts/offer-watch/gate.test.ts'], ['npx', 'tsx', 'scripts/offer-watch/pipeline.test.ts'], ['npx', 'tsx', '--test', ...unitTests], ['npm', 'run', 'build']],
  deployTimeoutMs: 20 * 60000, deployPollMs: 20000, liveTimeoutMs: 10 * 60000, livePollMs: 30000,
};
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ mode: 'dry-run', would_publish: plan.applied.map((a: any) => ({ card_id: a.card_id, file: a.file, changes: a.changes.length })), checks: cfg.checks.map(c => c.join(' ')) }, null, 2));
  process.exit(0);
}
const deps = {
  run: (cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || String(r.error || '') }; },
  fetchText: async (url: string) => { const r = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30000) }); return { status: r.status, text: await r.text() }; },
  readCard: (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')),
  sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  now: () => new Date(),
  log: (m: string) => console.error(m),
};
publish(plan.applied, cfg, deps).then(res => {
  saveLedger(upsertLedger(loadLedger(DEFAULT_LEDGER), res.ledger, new Date().toISOString()), DEFAULT_LEDGER);
  appendHistory(res.events, DEFAULT_HISTORY);
  console.log(JSON.stringify({ status: res.status, detail: res.detail, commits: res.commits, reverted: res.reverted, deployment: res.deployment, live_missing: res.live }, null, 2));
  process.exit(res.status === 'published' || res.status === 'nothing_to_publish' ? 0 : 1);
});
