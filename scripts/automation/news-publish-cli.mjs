#!/usr/bin/env node
/** Disabled-by-default manual entrypoint. Not referenced by any workflow. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { publishPortableNews } from './news-publish.mjs';
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
    return { code: r.status ?? 1, stdout: r.stdout ?? '' };
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
  main().catch(() => { console.error('Portable news publish stopped; disabled, denied, stale, pending, or unconfirmed. Reconcile GitHub before any retry.'); process.exitCode = 1; });
}
