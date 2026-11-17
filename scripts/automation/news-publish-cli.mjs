#!/usr/bin/env node
/** Disabled-by-default publish entrypoint, invoked by .github/workflows/news-cloud-publish.yml. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { publishPortableNews } from './news-publish.mjs';
import { CHECKS_PENDING } from './pr-merge-guard.mjs';
import { createVercelDeploymentReader } from './vercel-observer.mjs';

export function parsePublishOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--repo', '--plan-dir', '--publish', '--production-enable', '--owner-epoch', '--reconcile-existing'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('invalid manual argument');
    options[args[i]] = args[i + 1];
  }
  // Refuse before reading artifacts, touching git or querying auth when flags absent.
  if (options['--publish'] !== 'true' || options['--production-enable'] !== 'true' || !options['--owner-epoch']) throw new Error('production publishing disabled');
  return { repoPath: path.resolve(options['--repo']), artifactDir: path.resolve(options['--plan-dir']),
    ownerEpoch: options['--owner-epoch'], reconcileExisting: options['--reconcile-existing'] === 'true' };
}
/** Distinct, stable exit code: PR created/resumed but its checks are not finished. Not success. */
export const EXIT_CHECKS_PENDING = 75;
/** Only a pending-checks rejection carrying a valid PR identity is resumable; everything else stays a hard failure. */
export function pendingChecksResult(error) {
  if (error?.code !== CHECKS_PENDING || !Number.isSafeInteger(error.pr) || error.pr <= 0
    || !/^bot\/news-sync\/[0-9a-f]{24}$/.test(error.branch ?? '') || !/^[0-9a-f]{40}$/.test(error.head ?? '')) return null;
  return { state: CHECKS_PENDING, pr: error.pr, branch: error.branch, head: error.head };
}
export function publicationExitCode(result) {
  return result.deployment === 'UNCONFIRMED' || result.state === 'EXISTING_PR_RECONCILE' ? 1 : 0;
}
async function main() {
  const { repoPath, artifactDir: dir, ownerEpoch, reconcileExisting } = parsePublishOptions(process.argv.slice(2));
  const fetchDeployment = createVercelDeploymentReader({ token: process.env.VERCEL_TOKEN });
  const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
  const proposed = JSON.parse(fs.readFileSync(path.join(dir, 'proposed.json'), 'utf8'));
  const run = async (cmd, argv) => {
    if (!['git', 'gh'].includes(cmd)) throw new Error('non-repository helper forbidden');
    const r = spawnSync(cmd, argv, { cwd: repoPath, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    // stderr is returned only for exact-phrase classification (e.g. gh "no checks reported"); never logged.
    return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const result = await publishPortableNews({ plan, proposed, repoPath, publish: true, productionEnable: true, ownerEpoch, reconcileExisting, run, fetchDeployment,
    fetchLive: async url => { const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'cache-control': 'no-cache' } }); return { status: r.status, data: await r.json() }; },
  });
  console.log(JSON.stringify(result));
  if (publicationExitCode(result) !== 0) {
    console.error('News publication/deployment requires reconciliation; no rollback was attempted.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) {
  main().catch(error => {
    const pending = pendingChecksResult(error);
    if (pending) {
      console.log(JSON.stringify(pending));
      console.error('News PR checks are still pending; PR left open, nothing merged. Resume only with --reconcile-existing true.');
      process.exitCode = EXIT_CHECKS_PENDING;
      return;
    }
    console.error('Portable news publish stopped; disabled, denied, stale, pending, or unconfirmed. Reconcile GitHub before any retry.'); process.exitCode = 1;
  });
}
