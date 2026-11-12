import { createHash } from 'node:crypto';
/** Manual synthetic acceptance only. No production data, env loader, shell, remote publisher or Mac paths. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createAcceptanceFixture } from './acceptance-fixture';
import { createUpstashOfferState } from './redis-state';
import { runSandboxDaily } from './daily';
import { asyncOfferCheck } from './async-check';
import { isOfferCli } from './cli-entry';
// Only SHA-256 pins are public; the test database id and endpoint are injected from protected environment secrets.
export const TEST_DATABASE_ID_SHA256 = '535666579e49cd027c2ee6513c76c8cfa7b19d4991cf4e5bce67636b31cebb1a';
export const TEST_ENDPOINT_SHA256 = '04f761ca28daef5b3ad27673aec87736b3651032a553f91f13ec0471b1727c54';
export type SandboxPins = { databaseIdSha256: string; endpointSha256: string };
export const DEFAULT_SANDBOX_PINS: SandboxPins = Object.freeze({ databaseIdSha256: TEST_DATABASE_ID_SHA256, endpointSha256: TEST_ENDPOINT_SHA256 });
const sha256 = (value: string | undefined) => createHash('sha256').update(value ?? '').digest('hex');
export function sandboxConfiguration(args: string[], env: NodeJS.ProcessEnv, pins: SandboxPins = DEFAULT_SANDBOX_PINS) {
  const values = new Map<string, string>(); const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (['--fixtures', '--sdk', '--confirm-sandbox'].includes(name)) { if (flags.has(name)) throw Error('duplicate flag'); flags.add(name); }
    else if (['--out', '--namespace'].includes(name)) { if (values.has(name) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('argument refused'); values.set(name, args[++i]); }
    else throw Error('unknown argument; publication flags are not supported');
  }
  if (flags.has('--fixtures') === flags.has('--sdk')) throw Error('explicit single fixture/sdk mode required');
  const out = values.get('--out'); if (!out || !path.isAbsolute(out)) throw Error('external absolute fresh output required');
  const relative = path.relative(fs.realpathSync(process.cwd()), path.resolve(out));
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw Error('output must be outside checkout');
  const parent = fs.realpathSync(path.dirname(out)), repo = fs.realpathSync(process.cwd());
  if (parent === repo || parent.startsWith(`${repo}${path.sep}`)) throw Error('output parent resolves inside checkout');
  const sdk = flags.has('--sdk'), namespace = values.get('--namespace');
  if (sdk && (!flags.has('--confirm-sandbox') || !namespace || !/^[a-z0-9-]{8,40}$/.test(namespace) || !env.OPENCARD_SANDBOX_DATABASE_ID || sha256(env.OPENCARD_SANDBOX_DATABASE_ID) !== pins.databaseIdSha256 || sha256(env.OPENCARD_SANDBOX_URL) !== pins.endpointSha256 || !env.OPENCARD_SANDBOX_TOKEN)) throw Error('SDK requires explicit new test database, namespace and injected configuration');
  if (!sdk && (flags.has('--confirm-sandbox') || namespace)) throw Error('SDK-only options refused in fixture mode');
  return { sdk, out, prefix: sdk ? `opencard:offer-state:{sandbox-manual-${namespace}}:` : undefined };
}
export async function runSandboxAcceptance(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const config = sandboxConfiguration(args, env);
  // Refuse existing paths/symlinks. Workflow uploads only this fresh summary, not state, logs or secrets.
  fs.mkdirSync(config.out, { mode: 0o700 });
  const actual = fs.realpathSync(config.out), repo = fs.realpathSync(process.cwd());
  if (actual === repo || actual.startsWith(`${repo}${path.sep}`)) throw Error('resolved output inside checkout');
  const h = createAcceptanceFixture({ prettyMulti: true, checker: true, ...(config.sdk ? { stateFactory: (runnerId: string) => createUpstashOfferState({ enabled: true, prefix: config.prefix!, url: env.OPENCARD_SANDBOX_URL!, token: env.OPENCARD_SANDBOX_TOKEN!, runnerId, ttlMs: 60000 }) } : {}) });
  try {
    const first = h.make('portable-runner-a'), second = h.make('portable-runner-b');
    for (const entry of [first, second]) {
      entry.options.config.checks = [['npm', 'run', 'validate'], ['npm', 'run', 'build']];
      entry.options.asyncRun = (cmd, checkArgs, signal, context) => asyncOfferCheck(cmd, checkArgs, signal, { cwd: context.cwd, timeoutMs: 30000 });
    }
    const a = await runSandboxDaily(first.options), b = await runSandboxDaily(second.options);
    assert.equal(a.result.status, 'published'); assert.equal(b.result.status, 'published'); assert.equal(a.runId, b.runId);
    assert.equal(h.fetches(), 2); assert.deepEqual(h.writes, ['push', 'create', 'merge']);
    const summary = { mode: config.sdk ? 'official-sdk-http-sandbox' : 'fixtures-mock-redis', fixtureOnly: true, databaseId: config.sdk ? 'sha256-pinned' : null, syntheticSlot: a.runId, stages: ['collect', 'review', 'apply', 'mock-publisher', 'digest'], sourceFetches: h.fetches(), mockPublicationSequences: 1, freshLinkedWorktrees: 2, actualFixtureNpmChecks: true, remotePublication: 'ALWAYS MOCKED; no real push/PR/merge/deploy', actionsValidated: false };
    fs.writeFileSync(path.join(actual, 'result.json'), JSON.stringify(summary, null, 2), { mode: 0o600, flag: 'wx' });
    return summary;
  } finally { h.close(); }
}
if (isOfferCli(import.meta.url)) runSandboxAcceptance(process.argv.slice(2)).then(() => console.log('Synthetic sandbox acceptance passed; summary only, no publication enabled')).catch(() => { console.error('Sandbox runner failed closed; details suppressed'); process.exitCode = 1; });
