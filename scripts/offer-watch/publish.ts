/** PR-only publisher: default disabled. Explicit manual flags + authoritative remote owner/epoch + private journal required.
 * --dry-run reads only the supplied apply plan. --preflight refuses before daily review/apply if not provisioned.
 * No direct push/revert-push fallback; no arbitrary/home-bound helper.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createOfferPrTransport } from './pr-transport';
import { privateFileJournal } from './publish-journal';
import { createVercelDeploymentReader } from '../automation/vercel-observer.mjs';
import { publish, type PublishConfig } from './publish-core';
import { DEFAULT_HISTORY, DEFAULT_LEDGER, appendHistory, loadLedger, readHistory, saveLedger, upsertLedger } from './state';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
async function main() {
  const run = (cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15 * 60000, maxBuffer: 64 * 1024 * 1024 }); return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || String(r.error || '') }; };
  // Dry-run never constructs a publisher, reads env credentials, contacts GitHub or writes state.
  let transport;
  if (!process.argv.includes('--dry-run')) {
    const journalDir = arg('--journal-dir');
    if (!journalDir || !process.env.VERCEL_TOKEN) throw new Error('explicit private journal directory and VERCEL_TOKEN required (production remains disabled by default)');
    transport = createOfferPrTransport({ run, publish: process.argv.includes('--publish'), productionEnable: process.argv.includes('--production-enable'), ownerEpoch: arg('--owner-epoch'), runId: arg('--run-id'), store: privateFileJournal(journalDir), fetchDeployments: createVercelDeploymentReader({ token: process.env.VERCEL_TOKEN }) });
    await transport.authorize();
    if (process.argv.includes('--preflight')) { console.log('offer publication preflight passed; not a distributed lock or cutover acceptance'); return; }
  }
  const planFile = arg('--plan');
  if (!planFile) throw new Error('--plan <apply.json> is required (output of apply.ts --apply)');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (plan.mode !== 'apply') throw new Error('plan was not produced with --apply');
  const unitTests = fs.readdirSync('tests').filter(f => f.endsWith('.test.ts')).map(f => `tests/${f}`);
  const cfg: PublishConfig = {
    branch: 'main', remote: 'origin', vercelProject: 'opencard', vercelScope: 'opencard-ais-projects', siteBase: 'https://opencardai.com',
    checks: [['npm', 'run', 'validate'], ['npx', 'tsx', 'scripts/offer-watch/gate.test.ts'], ['npx', 'tsx', 'scripts/offer-watch/pipeline.test.ts'], ['npx', 'tsx', '--test', 'scripts/offer-watch/pr-transport.test.ts'], ['npx', 'tsx', '--test', ...unitTests], ['npm', 'run', 'build']],
    deployTimeoutMs: 20 * 60000, deployPollMs: 20000, liveTimeoutMs: 10 * 60000, livePollMs: 30000,
  };
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ mode: 'dry-run', would_publish: plan.applied.map((a: any) => ({ card_id: a.card_id, file: a.file, changes: a.changes.length })), checks: cfg.checks.map(c => c.join(' ')) }, null, 2));
    process.exit(0);
  }
  const deps = {
    run, transport,
    fetchText: async (url: string) => { const r = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30000) }); return { status: r.status, text: await r.text() }; },
    readCard: (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')),
    sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
    now: () => new Date(),
    log: (m: string) => console.error(m),
  };
  const res = await publish(plan.applied, cfg, deps);
  try {
    if (res.ledger.length) saveLedger(upsertLedger(loadLedger(DEFAULT_LEDGER), res.ledger, new Date().toISOString()), DEFAULT_LEDGER);
    if (res.events.length) {
      const prior = readHistory(DEFAULT_HISTORY);
      appendHistory(res.events.filter(e => !prior.some(p => p.type === e.type && p.card_id === e.card_id && p.commit === e.commit)), DEFAULT_HISTORY);
    }
  } catch {
    // Merge may already exist. Its journal/PR receipt must be reconciled, never blindly republished.
    console.log(JSON.stringify({ status: 'uncertain', detail: 'private ledger/history persistence failed; resume same run ID', commits: res.commits }));
    process.exitCode = 1; return;
  }
    console.log(JSON.stringify({ status: res.status, detail: res.detail, commits: res.commits, reverted: res.reverted, deployment: res.deployment, live_missing: res.live }, null, 2));
    process.exitCode = res.status === 'published' || res.status === 'nothing_to_publish' ? 0 : 1;
}
main().catch(() => { console.error('offer publish failed closed; credentials/command output suppressed; reconcile existing run before retry'); process.exitCode = 1; });
