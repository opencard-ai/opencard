import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertMergeable, CHECKS_PENDING, mergeVerifiedNewsPr } from './pr-merge-guard.mjs';
import { countTranslationCalls, describeFailure, MAX_TRANSLATION_CALLS, retryTranslation, StageError } from './news-portable.mjs';
import { createMiniMaxTranslator, TranslationError } from '../news-provider.mjs';
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

test('translation counter caps at 4 provider calls; a clean runNewsSync uses exactly zh+es', async () => {
  assert.equal(MAX_TRANSLATION_CALLS, 4);
  let provider = 0;
  const { translate, counter } = countTranslationCalls(async (items, lang) => { provider++; return items.map(i => ({ ...i, [`title_${lang}`]: `${lang}:${i.title}`, [`summary_${lang}`]: 's' })); });
  const rss = `<rss><channel><item><title>New card</title><link>https://example.test/a</link><pubDate>Fri, 06 Nov 2026 19:00:00 GMT</pubDate></item></channel></rss>`;
  const sources = [{ name: 'fixture', url: 'https://example.test/feed' }];
  const first = await runNewsSync({ previous: { items: [] }, sources, fetchSource: async () => (await import('../news-sync-core.mjs')).parseRSS(rss), translate, now: new Date('2026-11-06T20:00:00Z') });
  assert.equal(counter.calls, 2); assert.equal(provider, 2);
  await translate([{ title: 'x' }], 'zh'); await translate([{ title: 'x' }], 'es');
  await assert.rejects(translate([{ title: 'x' }], 'zh'), error => /cap exceeded/.test(error.message) && error.code === 'cap');
  assert.equal(provider, 4, 'fifth request refused before reaching the provider');
  // Cached titles: zero requests.
  const again = countTranslationCalls(async () => { throw new Error('must not be called'); });
  await runNewsSync({ previous: first.output, sources, fetchSource: async () => (await import('../news-sync-core.mjs')).parseRSS(rss), translate: again.translate, now: new Date('2026-11-06T20:00:00Z') });
  assert.equal(again.counter.calls, 0);
  assert.throws(() => countTranslationCalls(null), /provider required/);
});

test('one retry per locale only for retryable failures; worst case stays within the cap', async () => {
  const sleeps = [];
  const sleep = async ms => { sleeps.push(ms); };
  const flaky = codes => { let n = 0; return async (items, lang) => { const code = codes[n++]; if (code) throw code; return items.map(i => ({ ...i, [`title_${lang}`]: 't', [`summary_${lang}`]: 's' })); }; };
  // Transient failure then success: recovered with exactly one extra request.
  for (const error of [new TranslationError('http', { status: 429 }), new TranslationError('http', { status: 503 }), new TranslationError('count'), new TranslationError('incomplete'), new TranslationError('parse'), new TranslationError('truncated'), new TranslationError('timeout'), new TranslationError('network')]) {
    const { translate, counter } = countTranslationCalls(flaky([error]));
    assert.equal((await retryTranslation(translate, { sleep })([{ title: 'a' }], 'es'))[0].title_es, 't');
    assert.equal(counter.calls, 2, error.code);
  }
  // Non-retryable: credential, auth/request rejections, cap, unknown errors.
  for (const error of [new TranslationError('credential'), new TranslationError('http', { status: 401 }), new TranslationError('http', { status: 400 }), Object.assign(new Error('cap'), { code: 'cap' }), new Error('other')]) {
    const { translate, counter } = countTranslationCalls(flaky([error]));
    await assert.rejects(retryTranslation(translate, { sleep })([{ title: 'a' }], 'zh'), e => e === error && e.lang === 'zh' && e.attempts === 1);
    assert.equal(counter.calls, 1);
  }
  // Persistent failure on both locales would be 4 requests max; runNewsSync stops at the first locale.
  const always = countTranslationCalls(async () => { throw new TranslationError('http', { status: 500 }); });
  const rss = `<rss><channel><item><title>New card</title><link>https://example.test/a</link><pubDate>Fri, 06 Nov 2026 19:00:00 GMT</pubDate></item></channel></rss>`;
  await assert.rejects(runNewsSync({ previous: { items: [] }, sources: [{ name: 'f', url: 'https://example.test/feed' }], fetchSource: async () => (await import('../news-sync-core.mjs')).parseRSS(rss),
    translate: retryTranslation(always.translate, { sleep }), now: new Date('2026-11-06T20:00:00Z') }), e => e.code === 'http' && e.lang === 'zh' && e.attempts === 2);
  assert.equal(always.counter.calls, 2);
  assert.ok(sleeps.every(ms => ms > 0 && ms <= 5000));
  assert.throws(() => retryTranslation(async () => [], { attempts: 3 }), /attempt count/);
});

test('strict provider classifies failures with sanitized codes and tolerates only benign wrapping', async () => {
  const items = [{ title: 'A' }, { title: 'B' }];
  const rows = [{ idx: 0, title: 'a', summary: 'sa' }, { idx: 1, title: 'b', summary: 'sb' }];
  const respond = (body, { status = 200 } = {}) => async (url, init) => {
    assert.equal(JSON.parse(init.body).max_tokens, 8000);
    return { ok: status < 300, status, json: async () => body };
  };
  const text = (t, extra = {}) => ({ content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: t }], ...extra });
  const run = fetchImpl => createMiniMaxTranslator({ apiKey: 'synthetic-private-value', fetchImpl, timeoutMs: 50 })(items, 'es');
  for (const ok of [JSON.stringify(rows), '```json\n' + JSON.stringify(rows) + '\n```', 'Aquí está:\n' + JSON.stringify(rows), '<think>plan</think>' + JSON.stringify(rows)]) {
    assert.deepEqual((await run(respond(text(ok)))).map(i => i.title_es), ['a', 'b']);
  }
  const cases = [
    [respond({ error: { message: 'synthetic-private-value' } }, { status: 429 }), 'http', 429],
    [respond({}, { status: 401 }), 'http', 401],
    [respond(text(JSON.stringify(rows).slice(0, 20), { stop_reason: 'max_tokens' })), 'truncated'],
    [respond(text(JSON.stringify(rows.slice(0, 1)))), 'count'],
    [respond(text(JSON.stringify([rows[0], { ...rows[1], summary: '' }]))), 'incomplete'],
    [respond(text(JSON.stringify(rows.map(r => ({ ...r, idx: r.idx + 1 }))))), 'incomplete'],
    [respond(text('no json here synthetic-private-value')), 'parse'],
    [async () => { throw new Error('synthetic-private-value'); }, 'network'],
    [async () => new Promise(() => {}), 'timeout'],
  ];
  for (const [fetchImpl, code, status] of cases) {
    await assert.rejects(run(fetchImpl), error => error instanceof TranslationError && error.code === code && error.status === status
      && /unavailable/.test(error.message) && !error.message.includes('synthetic-private-value'));
  }
  await assert.rejects(createMiniMaxTranslator({ apiKey: '' })(items, 'zh'), e => e.code === 'credential');
  let legacyCeiling;
  await createMiniMaxTranslator({ apiKey: 'synthetic', failureMode: 'legacy-fallback', fetchImpl: async (url, init) => { legacyCeiling = JSON.parse(init.body).max_tokens; return { ok: true, json: async () => text(JSON.stringify(rows)) }; } })(items, 'es');
  assert.equal(legacyCeiling, 4000, 'legacy Mac request unchanged');
});

test('failure description is allowlisted (stage/reason/lang/status/attempts only)', () => {
  assert.equal(describeFailure(Object.assign(new TranslationError('http', { status: 429 }), { lang: 'es', attempts: 2 }), 'plan'), 'stage=translate reason=http lang=es status=429 attempts=2');
  assert.equal(describeFailure(new StageError('source', { reason: 'http', status: '503' }), 'plan'), 'stage=source reason=http status=503');
  assert.equal(describeFailure(new Error('Bearer synthetic-private-value'), 'snapshot'), 'stage=snapshot');
  assert.equal(describeFailure(new StageError('source', { reason: 'Bearer synthetic value' }), 'plan'), 'stage=source reason=unknown');
});

test('shadow CLI prints a sanitized failure reason and step summary on provider failure (synthetic key, mocked network)', () => {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  const sha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-fail-'));
  const guard = path.join(cwd, 'guard.mjs'), summary = path.join(cwd, 'summary.md');
  fs.writeFileSync(guard, `let n=0;globalThis.fetch=async u=>{if(!String(u).startsWith('https://api.minimax.io/'))throw new Error('network forbidden');n++;return{ok:true,status:200,json:async()=>({content:[{type:'text',text:'[]'}]})}};process.on('exit',()=>process.stderr.write('mockRequests='+n+'\\n'));`);
  try {
    const r = spawnSync(process.execPath, ['--import', guard, fileURLToPath(new URL('./news-shadow.mjs', import.meta.url)), '--repo', repo, '--sha', sha, '--now', '2026-11-06T20:00:00Z', '--slot', 'evening', '--run-id', 'fail-1', '--source', 'fixture', '--provider', 'minimax', '--scratch-root', cwd],
      { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, MINIMAX_API_KEY: 'synthetic-private-value', GITHUB_STEP_SUMMARY: summary } });
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /news-shadow translationCalls=2 max=4 provider=minimax/);
    assert.match(r.stderr, /News shadow failed: stage=translate reason=count lang=zh attempts=2; no production writes/);
    assert.match(r.stderr, /mockRequests=2/);
    assert.match(fs.readFileSync(summary, 'utf8'), /stage=translate reason=count lang=zh attempts=2/);
    assert.ok(!r.stderr.includes('synthetic-private-value'));
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
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
    assert.match(r.stderr, /news-shadow translationCalls=[0-2] max=4 provider=fixture/);
    const metrics = JSON.parse(fs.readFileSync(path.join(out, 'metrics.json'), 'utf8'));
    assert.deepEqual(Object.keys(metrics).sort(), ['maxTranslationCalls', 'provider', 'translationCalls', 'version']);
    assert.ok(metrics.translationCalls >= 0 && metrics.translationCalls <= 2);
    assert.deepEqual(fs.readdirSync(out).sort(), ['metrics.json', 'plan.json', 'proposed.json']);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('cloud workflow: explicit UTC schedule, read-only token permissions, pinned actions, env, epoch parity, no auto/force', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/news-cloud-publish.yml', import.meta.url), 'utf8');
  const owner = JSON.parse(fs.readFileSync(new URL('../../ops/runner-owner.json', import.meta.url), 'utf8'));
  assert.deepEqual(owner, { version: 1, news: { owner: 'github-actions', productionEnabled: true, epoch: owner.news.epoch } });
  assert.equal(Object.keys(owner).sort().join(), 'news,version', 'no offer section');
  // GitHub ignored `timezone:` (run 43540487976 fired 01:25Z); cron is explicit UTC = 01:08/13:08 PST.
  assert.equal([...workflow.matchAll(/- cron: '([^']+)'/g)].map(m => m[1]).join(), '8 9,21 * * *');
  assert.doesNotMatch(workflow, /^\s+timezone:/m);
  assert.match(workflow, /2027-03-14/);
  assert.match(workflow, /hour=\$\(TZ=America\/Los_Angeles date \+%H\)/);
  const ptHour = iso => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
  const slotOf = iso => ptHour(iso) < 12 ? 'morning' : 'evening';
  // PST now and PDT after 2027-03-14 (unchanged cron): slots stay correct, including +3h scheduler delay.
  for (const [iso, hour, slot] of [['2026-11-14T09:08:00Z', 1, 'morning'], ['2026-11-14T21:08:00Z', 13, 'evening'], ['2027-07-01T09:08:00Z', 2, 'morning'], ['2027-07-01T21:08:00Z', 14, 'evening'], ['2026-11-14T12:08:00Z', 4, 'morning'], ['2026-11-15T00:08:00Z', 16, 'evening']]) {
    assert.equal(ptHour(iso), hour, iso); assert.equal(slotOf(iso), slot, iso);
  }
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
