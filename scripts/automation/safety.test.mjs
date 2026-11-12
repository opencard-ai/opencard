import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertMergeable, mergeVerifiedNewsPr } from './pr-merge-guard.mjs';
import { callOfferPrHelper } from './offer-transport.mjs';
import { prepareNewsDryRun } from './news-dry-run-core.mjs';

const head = 'a'.repeat(40), merged = 'b'.repeat(40);
const pr = { headRefOid: head, files: [{ path: 'data/news.json' }], state: 'OPEN', baseRefName: 'main', isDraft: false };
const checks = [{ name: 'validate', state: 'SUCCESS', bucket: 'pass' }];
const gate = (p = pr, c = checks) => assertMergeable({ pr: p, checks: c, expectedHead: head, allowedFile: f => f === 'data/news.json' });
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/news.json', import.meta.url), 'utf8'));
const input = { fixture, now: '2026-11-06T20:00:00Z', slot: 'morning', runId: 'fixture-1' };

test('merge gate only accepts explicit success, required check, exact head and allowlist', () => {
  gate();
  for (const bad of [[], null, {}, [{ name: 'validate', state: 'PENDING', bucket: 'pending' }],
    [{ name: 'validate', state: 'CANCELLED', bucket: 'cancel' }], [{ name: 'validate', state: 'FAILURE', bucket: 'fail' }],
    [{ name: 'validate', state: 'NEUTRAL', bucket: 'pass' }], [{ name: 'other', state: 'SUCCESS', bucket: 'pass' }]]) assert.throws(() => gate(pr, bad));
  for (const changed of [{ ...pr, headRefOid: merged }, { ...pr, files: [] }, { ...pr, files: [{ path: 'ops/state.json' }] }, { ...pr, isDraft: true }, { ...pr, state: 'MERGED' }, { ...pr, baseRefName: 'other' }]) assert.throws(() => gate(changed));
});

function fakeRunner({ changedHead = false, apiError = false, emptyChecks = false, receipt = true } = {}) {
  const calls = [];
  let views = 0;
  return { calls, run: async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[1] === 'merge') return { code: 0, stdout: 'acknowledged' };
    if (apiError) return { code: 1, stdout: '[]' };
    if (args[1] === 'checks') return { code: 0, stdout: JSON.stringify(emptyChecks ? [] : checks) };
    if (args.at(-1) === 'state,mergeCommit') return { code: 0, stdout: JSON.stringify(receipt ? { state: 'MERGED', mergeCommit: { oid: merged } } : { state: 'OPEN' }) };
    views++;
    return { code: 0, stdout: JSON.stringify(changedHead && views > 1 ? { ...pr, headRefOid: merged } : pr) };
  } };
}
test('no-check, API failure, or changed head never reaches merge', async () => {
  for (const config of [{ emptyChecks: true }, { apiError: true }, { changedHead: true }]) {
    const fake = fakeRunner(config);
    await assert.rejects(mergeVerifiedNewsPr({ ...fake, prNumber: 123, expectedHead: head, write: true }));
    assert.equal(fake.calls.some(c => c[2] === 'merge'), false);
  }
});
test('no implicit write; successful merge is SHA-bound, confirmed, never auto-merge', async () => {
  const fake = fakeRunner();
  await assert.rejects(mergeVerifiedNewsPr({ ...fake, prNumber: 123, expectedHead: head }));
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(await mergeVerifiedNewsPr({ ...fake, prNumber: 123, expectedHead: head, write: true }), { state: 'MERGED', mergeSha: merged });
  const merge = fake.calls.find(c => c[2] === 'merge');
  assert.equal(merge.at(-1), head);
  assert.ok(merge.includes('--match-head-commit'));
  assert.ok(!merge.includes('--auto'));
  const pending = fakeRunner({ receipt: false });
  await assert.rejects(mergeVerifiedNewsPr({ ...pending, prNumber: 123, expectedHead: head, write: true }), /unconfirmed/);
});
test('offer transport has no absent-helper or failed-helper direct-push fallback', async () => {
  let calls = 0;
  const invoke = async () => { calls++; return { code: 0, stdout: `MERGED_SHA=${merged}\n` }; };
  await assert.rejects(callOfferPrHelper({ mode: 'merge', sha: head, invoke }), /required/);
  assert.equal(calls, 0);
  assert.deepEqual(await callOfferPrHelper({ helper: '/fixture/helper', mode: 'merge', sha: head, invoke }), { mergeSha: merged });
  await assert.rejects(callOfferPrHelper({ helper: '/fixture/helper', mode: 'rollback', sha: head, invoke: async () => ({ code: 1, stdout: '' }) }), /no direct-push/);
  await assert.rejects(callOfferPrHelper({ helper: '/fixture/helper', mode: 'merge', sha: head, invoke: async () => ({ code: 0, stdout: 'auto-merge requested' }) }), /receipt/);
});
test('fixture-only dry-run is deterministic; slots and attempts are distinct identities', async () => {
  const first = await prepareNewsDryRun(input);
  assert.deepEqual(first, await prepareNewsDryRun(input));
  assert.notEqual(first.plan.slotKey, (await prepareNewsDryRun({ ...input, slot: 'evening' })).plan.slotKey);
  assert.notEqual(first.plan.runKey, (await prepareNewsDryRun({ ...input, runId: 'fixture-2' })).plan.runKey);
  assert.equal(first.proposed.items[0].title_zh, '測試信用卡更新');
  await assert.rejects(prepareNewsDryRun({ ...input, fixture: { ...fixture, translations: {} } }), /translation missing/);
  await assert.rejects(prepareNewsDryRun({ ...input, runId: '../escape' }));
  await assert.rejects(prepareNewsDryRun({ ...input, now: '2026-02-30T20:00:00Z' }), /calendar/);
});
test('CLI writes only private scratch, preserves production sentinels, uses no network/child tools/env loading', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'news-sentinel-'));
  const paths = ['data/news.json', 'artifacts/offer-watch/ledger.json', '.env.local'];
  for (const rel of paths) { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), 'sentinel'); }
  const guard = path.join(cwd, 'deny-io.mjs');
  fs.writeFileSync(guard, `import cp from 'node:child_process'; import http from 'node:http'; import https from 'node:https'; import {syncBuiltinESMExports} from 'node:module';
    const deny=()=>{throw new Error('network/child side effect forbidden')};
    globalThis.fetch=deny; http.request=deny; http.get=deny; https.request=deny; https.get=deny;
    cp.spawn=deny; cp.spawnSync=deny; cp.execFile=deny; cp.execFileSync=deny; cp.exec=deny; cp.execSync=deny; syncBuiltinESMExports();`);
  const cli = fileURLToPath(new URL('./news-dry-run.mjs', import.meta.url));
  let out;
  try {
    out = execFileSync(process.execPath, ['--import', guard, cli, '--now', input.now, '--slot', input.slot, '--run-id', input.runId], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } }).trim();
    assert.equal(fs.statSync(out).mode & 0o777, 0o700);
    assert.deepEqual(fs.readdirSync(out).sort(), ['plan.json', 'proposed.json']);
    for (const rel of paths) assert.equal(fs.readFileSync(path.join(cwd, rel), 'utf8'), 'sentinel');
    assert.throws(() => execFileSync(process.execPath, [cli, '--out', cwd], { cwd, stdio: 'pipe' }));
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); if (out) fs.rmSync(out, { recursive: true, force: true }); }
});
test('manual fixture chain has no secrets; explicit sandbox SDK is separated and read-only', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/news-isolated-dry-run.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  for (const action of ['checkout', 'setup-node', 'upload-artifact']) assert.match(workflow, new RegExp(`actions/${action}@[0-9a-f]{40}`));
  const text = workflow;
  const fixture = text.match(/^[\s\S]*?\n  fixture-dry-run:\n[\s\S]*?(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/m)?.[0];
  const sdk = text.match(/^  sdk-sandbox:\n[\s\S]*?(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/m)?.[0];
  assert.ok(fixture);assert.ok(sdk);
  assert.doesNotMatch(fixture, /secrets\.|environment:/);
  assert.doesNotMatch(workflow, /schedule:|pull_request_target|contents: write|pull-requests: write|id-token:|sync-news\.mjs|news-publish|--publish|production-enable|gh pr|git push|vercel/);
  assert.match(fixture,/sdk_sandbox:[\s\S]*?type: boolean\n        default: false/);
  assert.match(sdk,/inputs\.sdk_sandbox == true/);assert.match(sdk,/needs: fixture-dry-run/);
  assert.match(sdk,/environment: opencard-migration-sandbox/);
  assert.deepEqual([...sdk.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]).sort(),['OPENCARD_SANDBOX_DATABASE_ID','OPENCARD_SANDBOX_TOKEN','OPENCARD_SANDBOX_URL']);
  assert.match(sdk,/--sdk --confirm-sandbox/);assert.doesNotMatch(workflow,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);assert.match(sdk,/databaseId,'sha256-pinned'/);
});
