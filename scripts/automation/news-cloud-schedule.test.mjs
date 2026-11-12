import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertMergeable, CHECKS_PENDING, mergeVerifiedNewsPr } from './pr-merge-guard.mjs';
import { countTranslationCalls, MAX_TRANSLATION_CALLS } from './news-portable.mjs';
import { EXIT_CHECKS_PENDING, pendingChecksResult, publicationExitCode } from './news-publish-cli.mjs';
import { runNewsSync } from '../sync-news.mjs';

const head = 'a'.repeat(40);
const pr = { headRefOid: head, files: [{ path: 'data/news.json' }], state: 'OPEN', baseRefName: 'main', isDraft: false };
const ok = (name, state = 'SUCCESS', bucket = 'pass') => ({ name, state, bucket });
const gate = checks => assertMergeable({ pr, checks, expectedHead: head, allowedFile: f => f === 'data/news.json', requiredChecks: ['validate', 'gitleaks'] });
const codeOf = fn => { try { fn(); return 'PASSED'; } catch (error) { return error.code ?? 'HARD'; } };

test('pending vs hard failure classification stays fail-closed', () => {
  assert.equal(codeOf(() => gate([ok('validate'), ok('gitleaks')])), 'PASSED');
  // Pending (resumable): empty list, any pending bucket, required check not yet registered.
  for (const checks of [[], [ok('validate', 'PENDING', 'pending'), ok('gitleaks')], [ok('validate'), ok('Vercel', 'PENDING', 'pending'), ok('gitleaks')], [ok('validate')]]) assert.equal(codeOf(() => gate(checks)), CHECKS_PENDING);
  // Hard: failure/cancel even if others pending, neutral/skipped, malformed, PR gates.
  for (const checks of [[ok('validate', 'FAILURE', 'fail'), ok('gitleaks', 'PENDING', 'pending')], [ok('validate', 'CANCELLED', 'cancel')], [ok('validate', 'NEUTRAL', 'pass'), ok('gitleaks')], [ok('validate', 'SKIPPED', 'skipping'), ok('gitleaks')], null, {}]) assert.equal(codeOf(() => gate(checks)), 'HARD');
  for (const bad of [{ ...pr, isDraft: true }, { ...pr, headRefOid: 'b'.repeat(40) }, { ...pr, files: [{ path: 'ops/runner-owner.json' }] }]) {
    assert.equal(codeOf(() => assertMergeable({ pr: bad, checks: [], expectedHead: head, allowedFile: f => f === 'data/news.json' })), 'HARD');
  }
  assert.equal(codeOf(() => assertMergeable({ pr, checks: [ok('validate')], expectedHead: head, allowedFile: () => true, requiredChecks: [] })), 'HARD');
});

test('pending checks never merge and reject with the pending code', async () => {
  let merged = false;
  await assert.rejects(mergeVerifiedNewsPr({ prNumber: 9, expectedHead: head, write: true, requiredChecks: ['validate', 'gitleaks'], run: async (_, args) => {
    if (args[1] === 'merge') { merged = true; return { code: 0, stdout: '' }; }
    return { code: 0, stdout: JSON.stringify(args[1] === 'checks' ? [ok('validate', 'PENDING', 'pending')] : pr) };
  } }), error => error.code === CHECKS_PENDING);
  assert.equal(merged, false);
});

test('CLI maps only a fully identified pending rejection to exit 75; everything else stays 1', () => {
  const error = Object.assign(new Error('checks not explicitly successful'), { code: CHECKS_PENDING, pr: 12, branch: 'bot/news-sync/0123456789abcdef01234567', head });
  assert.deepEqual(pendingChecksResult(error), { state: CHECKS_PENDING, pr: 12, branch: 'bot/news-sync/0123456789abcdef01234567', head });
  assert.equal(EXIT_CHECKS_PENDING, 75);
  for (const bad of [new Error('x'), { ...error, code: 'OTHER' }, { ...error, pr: 0 }, { ...error, branch: 'bot/news-sync/20261112-0108' }, { ...error, head: 'short' }, Object.assign(new Error('no checks'), { code: CHECKS_PENDING })]) assert.equal(pendingChecksResult(bad), null);
  assert.equal(publicationExitCode({ state: 'NO_CHANGE' }), 0);
  assert.equal(publicationExitCode({ state: 'MERGED', deployment: 'UNCONFIRMED' }), 1);
});

test('translation counter caps at 2 provider calls and runNewsSync uses at most zh+es', async () => {
  assert.equal(MAX_TRANSLATION_CALLS, 2);
  let provider = 0;
  const { translate, counter } = countTranslationCalls(async (items, lang) => { provider++; return items.map(i => ({ ...i, [`title_${lang}`]: `${lang}:${i.title}`, [`summary_${lang}`]: 's' })); });
  const rss = `<rss><channel><item><title>New card</title><link>https://example.test/a</link><pubDate>Fri, 06 Nov 2026 19:00:00 GMT</pubDate></item></channel></rss>`;
  const sources = [{ name: 'fixture', url: 'https://example.test/feed' }];
  const first = await runNewsSync({ previous: { items: [] }, sources, fetchSource: async () => (await import('../news-sync-core.mjs')).parseRSS(rss), translate, now: new Date('2026-11-06T20:00:00Z') });
  assert.equal(counter.calls, 2); assert.equal(provider, 2);
  await assert.rejects(translate([{ title: 'x' }], 'zh'), /cap exceeded/);
  assert.equal(provider, 2, 'third request refused before reaching the provider');
  // Cached titles: zero requests.
  const again = countTranslationCalls(async () => { throw new Error('must not be called'); });
  await runNewsSync({ previous: first.output, sources, fetchSource: async () => (await import('../news-sync-core.mjs')).parseRSS(rss), translate: again.translate, now: new Date('2026-11-06T20:00:00Z') });
  assert.equal(again.counter.calls, 0);
  assert.throws(() => countTranslationCalls(null), /provider required/);
});

test('shadow CLI writes metrics.json and logs the call count to stderr only (fixture provider, no network)', () => {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  const sha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-metrics-'));
  const guard = path.join(cwd, 'guard.mjs');
  fs.writeFileSync(guard, `globalThis.fetch=()=>{throw new Error('network forbidden')};`);
  let out;
  try {
    const r = spawnSync(process.execPath, ['--import', guard, fileURLToPath(new URL('./news-shadow.mjs', import.meta.url)), '--repo', repo, '--sha', sha, '--now', '2026-11-06T20:00:00Z', '--slot', 'evening', '--run-id', 'metrics-1', '--scratch-root', cwd], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(r.status, 0, r.stderr);
    out = r.stdout.trim();
    assert.equal(out.split('\n').length, 1, 'stdout is only the artifact path');
    assert.match(r.stderr, /news-shadow translationCalls=[0-2] max=2 provider=fixture/);
    const metrics = JSON.parse(fs.readFileSync(path.join(out, 'metrics.json'), 'utf8'));
    assert.deepEqual(Object.keys(metrics).sort(), ['maxTranslationCalls', 'provider', 'translationCalls', 'version']);
    assert.ok(metrics.translationCalls >= 0 && metrics.translationCalls <= 2);
    assert.deepEqual(fs.readdirSync(out).sort(), ['metrics.json', 'plan.json', 'proposed.json']);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('cloud workflow: schedule+tz, read-only token permissions, pinned actions, env, epoch parity, no auto/force', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/news-cloud-publish.yml', import.meta.url), 'utf8');
  const owner = JSON.parse(fs.readFileSync(new URL('../../ops/runner-owner.json', import.meta.url), 'utf8'));
  assert.deepEqual(owner, { version: 1, news: { owner: 'github-actions', productionEnabled: true, epoch: owner.news.epoch } });
  assert.equal(Object.keys(owner).sort().join(), 'news,version', 'no offer section');
  assert.match(workflow, /cron: '8 1,13 \* \* \*'\n\s+timezone: 'America\/Los_Angeles'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\n\s+contents: read\n/);
  assert.match(workflow, /group: news-publish\n\s+cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 30/); assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /environment: news-production/);
  assert.match(workflow, new RegExp(`NEWS_EPOCH: ${owner.news.epoch}\\n`));
  assert.equal([...workflow.matchAll(/--owner-epoch "\$NEWS_EPOCH"/g)].length, 2);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.doesNotMatch(workflow, /uses: [^\n]+@v\d/);
  assert.match(workflow, /MINIMAX_API_KEY: \$\{\{ secrets\.MINIMAX_API_KEY \}\}/);
  assert.match(workflow, /--source public --provider minimax/);
  assert.equal(new Set([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1])).size, 3);
  assert.doesNotMatch(workflow, /pull_request_target|contents: write|--auto|--force|--admin|set -x|upload-artifact|git push/);
  assert.match(workflow, /"\$code" -eq 75/);
  assert.match(workflow, /--reconcile-existing true/);
});

test('gh "no checks reported" (exit 1) and pending exit 8 become pending; other non-zero exits stay hard', async () => {
  const runWith = checksResult => async (_, args) => {
    if (args[1] === 'merge') throw new Error('merge must not run');
    if (args[1] === 'checks') return checksResult;
    return { code: 0, stdout: JSON.stringify(pr) };
  };
  const call = r => mergeVerifiedNewsPr({ prNumber: 3, expectedHead: head, write: true, requiredChecks: ['validate', 'gitleaks'], run: runWith(r) });
  await assert.rejects(call({ code: 1, stdout: '', stderr: "no checks reported on the 'bot/news-sync/x' branch" }), e => e.code === CHECKS_PENDING);
  await assert.rejects(call({ code: 8, stdout: JSON.stringify([ok('validate', 'PENDING', 'pending')]) }), e => e.code === CHECKS_PENDING);
  for (const hard of [{ code: 1, stdout: '', stderr: 'HTTP 502' }, { code: 1, stdout: '[]' }, { code: 8, stdout: 'not json' }, { code: 8, stdout: '{}' }, { code: 2, stdout: '', stderr: 'unknown error' }]) {
    await assert.rejects(call(hard), e => e.code !== CHECKS_PENDING);
  }
  await assert.rejects(call({ code: 8, stdout: JSON.stringify([ok('validate', 'FAILURE', 'fail')]) }), e => e.code !== CHECKS_PENDING);
});

test('every run step that tolerates expected non-zero exits disables errexit explicitly', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/news-cloud-publish.yml', import.meta.url), 'utf8');
  for (const marker of ['news-publish-cli.mjs --repo "$GITHUB_WORKSPACE" --plan-dir "$PLAN_DIR" \\\n            --publish true --production-enable true --owner-epoch "$NEWS_EPOCH" --reconcile-existing "$RECONCILE"', 'gh pr checks "$PR"', '--reconcile-existing true > "$RUNNER_TEMP/phase2.json"']) {
    const at = workflow.indexOf(marker);
    assert.ok(at > 0, marker);
    const stepStart = workflow.lastIndexOf('run: |', at);
    assert.match(workflow.slice(stepStart, at), /set \+e/);
  }
});
