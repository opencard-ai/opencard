import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { probeOnce, main, BODY, TITLE, SOURCE, ENDPOINT, DEADLINE_MS } from './minimax-probe.mjs';

// Synthetic credential only. No environment credentials or native fetch in tests.
const KEY = 'offline-secret-never-publish';
const translated = 'MiniMax M2.5 與 M2.7 模型退役通知';
const good = () => ({ model: 'MiniMax-M3', stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ title: translated }) }],
  usage: { input_tokens: 42, output_tokens: 24, cache_read_input_tokens: 0 } });

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'minimax-offline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoDir = path.join(root, 'repo');
  await mkdir(repoDir);
  return { apiKey: KEY, repoDir, scratchDir: path.join(root, 'scratch') };
}
const response = value => ({ ok: true, text: async () => JSON.stringify(value) });
async function noResult(config) {
  await assert.rejects(readFile(path.join(config.scratchDir, 'result.json')), { code: 'ENOENT' });
}

test('exact one POST, fixed body/options, safe result and private exclusive ledger', async t => {
  const config = await fixture(t);
  let calls = 0;
  let timerCleared = false;
  const safe = await probeOnce({ ...config,
    setTimer: (_callback, ms) => { assert.equal(ms, 120000); return 123; },
    clearTimer: id => { assert.equal(id, 123); timerCleared = true; },
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(await readFile(path.join(config.scratchDir, 'attempt.ledger'), 'utf8'), 'attempt claimed\n');
      assert.equal(url, 'https://api.minimax.io/anthropic/v1/messages');
      assert.equal(url, ENDPOINT);
      assert.deepEqual(Object.keys(options).sort(), ['body', 'headers', 'method', 'redirect', 'signal']);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      assert.deepEqual(options.headers, { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': KEY });
      assert.equal(options.body, BODY);
      assert.deepEqual(JSON.parse(options.body), {
        model: 'MiniMax-M3', thinking: { type: 'disabled' }, service_tier: 'standard', stream: false, max_tokens: 256,
        system: 'Translate the supplied title into Traditional Chinese. Return only a JSON object with exactly one field "title". Preserve MiniMax, M2.5 and M2.7 exactly.',
        messages: [{ role: 'user', content: 'MiniMax M2.5 and M2.7 Model Retirement Notice' }],
      });
      const value = good();
      value.usage.arbitrary = 'never copy arbitrary upstream fields';
      return response(value);
    } });
  assert.equal(calls, 1); assert.equal(timerCleared, true);
  assert.deepEqual(safe, { source: SOURCE, source_title: TITLE,
    requested: { model: 'MiniMax-M3', thinking: 'disabled', service_tier: 'standard', stream: false, max_tokens: 256, deadline_ms: DEADLINE_MS },
    model: 'MiniMax-M3', stop_reason: 'end_turn', usage: { input_tokens: 42, output_tokens: 24, cache_read_input_tokens: 0 }, title: translated });
  assert.deepEqual(JSON.parse(await readFile(path.join(config.scratchDir, 'result.json'), 'utf8')), safe);
  assert.equal((await stat(config.scratchDir)).mode & 0o777, 0o700);
  for (const name of ['attempt.ledger', 'result.json']) {
    assert.equal((await stat(path.join(config.scratchDir, name))).mode & 0o777, 0o600);
    assert.ok(!(await readFile(path.join(config.scratchDir, name), 'utf8')).includes(KEY));
  }
  await assert.rejects(probeOnce({ ...config, fetchImpl: () => { calls++; throw Error(KEY); } }), /refused or failed/);
  assert.equal(calls, 1);
});

test('request/body failure, HTTP refusal and redirect refusal consume exactly one attempt; no retry', async t => {
  for (const kind of ['throw', 'body', 'http', 'redirect']) {
    const config = await fixture(t); let calls = 0;
    const fetchImpl = async (_url, options) => {
      calls++; assert.equal(options.redirect, 'error');
      if (kind === 'body') return { ok: true, text: async () => { throw new Error(KEY); } };
      if (kind !== 'http') throw new Error(KEY + ' raw upstream failure');
      return { ok: false, text: () => { throw new Error('must not read refusal body ' + KEY); } };
    };
    for (let invocation = 0; invocation < 2; invocation++) {
      await assert.rejects(probeOnce({ ...config, fetchImpl }), error => {
        assert.equal(error.message, 'MiniMax probe refused or failed; no public result.');
        assert.equal(error.cause, undefined); return true;
      });
    }
    assert.equal(calls, 1); await noResult(config);
    assert.deepEqual(await readdir(config.scratchDir), ['attempt.ledger']);
  }
});

test('deadline covers ignored abort and hanging response body, with late completion unable to publish', async t => {
  for (const phase of ['fetch', 'body']) {
    const config = await fixture(t); let calls = 0, fire, resolveLate, signal;
    const late = new Promise(resolve => { resolveLate = resolve; });
    let fetchEntered, bodyEntered, bodyCompleted;
    const fetchReady = new Promise(resolve => { fetchEntered = resolve; });
    const bodyReady = new Promise(resolve => { bodyEntered = resolve; });
    const completed = new Promise(resolve => { bodyCompleted = resolve; });
    const value = good();
    assert.ok(!JSON.stringify(value).includes(KEY));
    const lateResponse = { ok: true, text: async () => {
      bodyEntered();
      const raw = phase === 'body' ? await late : JSON.stringify(value);
      bodyCompleted();
      return raw;
    } };
    const pending = probeOnce({ ...config,
      setTimer: (callback, ms) => { assert.equal(ms, DEADLINE_MS); fire = callback; return 1; },
      clearTimer: () => {},
      fetchImpl: async (_url, options) => {
        calls++; signal = options.signal; fetchEntered();
        return phase === 'fetch' ? late : lateResponse;
      } });
    await (phase === 'fetch' ? fetchReady : bodyReady);
    fire();
    await assert.rejects(pending, /refused or failed/);
    assert.equal(signal.aborted, true); assert.equal(calls, 1); await noResult(config);
    resolveLate(phase === 'fetch' ? lateResponse : JSON.stringify(value));
    await bodyReady;
    await completed;
    // Drain the request continuation after text() has actually completed.
    await new Promise(resolve => setImmediate(resolve));
    await noResult(config);
    await assert.rejects(probeOnce({ ...config, fetchImpl: () => { calls++; } }));
    assert.equal(calls, 1);
  }
});

test('untrusted output, truncation, missing fields, thinking/tools, usage and secret echoes fail closed', async t => {
  const mutations = [
    v => { v.stop_reason = 'max_tokens'; }, v => { delete v.stop_reason; },
    v => { delete v.model; }, v => { v.model = 'MiniMax-M2.7'; },
    v => { delete v.content; }, v => { v.content = []; },
    v => { v.content.push({ type: 'thinking', thinking: KEY }); },
    v => { v.content = [{ type: 'tool_use', name: 'anything' }]; },
    v => { v.thinking = {}; }, v => { v.content[0].thinking = 'hidden'; },
    v => { v.content[0].text = '{"title":'; },
    v => { v.content[0].text = '{}'; },
    v => { v.content[0].text = JSON.stringify({ title: translated, extra: 1 }); },
    v => { v.content[0].text = JSON.stringify({ title: translated + ' SECRET' }); },
    v => { v.content[0].text = JSON.stringify({ title: 'MiniMax M2.5 M2.7 <script>' }); },
    v => { v.content[0].text = JSON.stringify({ title: 'MiniMax M2.5 模型退役通知' }); },
    v => { v.content[0].text = JSON.stringify({ title: translated + '\n' }); },
    v => { v.content[0].text = JSON.stringify({ title: translated + '漢'.repeat(120) }); },
    v => { v.content[0].text = JSON.stringify({ title: translated + KEY }); },
    v => { v.extra = KEY; }, v => { v.usage.ignored = KEY; },
    v => { v.usage.input_tokens = -1; }, v => { v.usage.output_tokens = 0.5; },
    v => { v.usage.output_tokens = '24'; }, v => { v.usage.input_tokens = Number.MAX_SAFE_INTEGER + 1; },
    v => { v.usage = null; }, v => { v.usage = []; },
  ];
  for (const mutate of mutations) {
    const config = await fixture(t); const value = good(); mutate(value);
    let calls = 0;
    await assert.rejects(probeOnce({ ...config, fetchImpl: async () => { calls++; return response(value); } }),
      { message: 'MiniMax probe refused or failed; no public result.' });
    assert.equal(calls, 1); await noResult(config);
  }
  // A Han-only synthetic key passes the script allowlist but must still be rejected after JSON decoding.
  const config = await fixture(t); const value = good(); delete value.usage;
  value.content[0].text = JSON.stringify({ title: translated + '秘密' }).replace('秘密', '\\u79d8\\u5bc6');
  await assert.rejects(probeOnce({ ...config, apiKey: '秘密', fetchImpl: async () => response(value) }));
  await noResult(config);
});

test('returned output usage over 256 fails closed; input usage may exceed 256', async t => {
  for (const output of [256, 257]) {
    const config = await fixture(t); const value = good();
    value.usage = { input_tokens: 1024, output_tokens: output };
    let calls = 0;
    const pending = probeOnce({ ...config, fetchImpl: async () => { calls++; return response(value); } });
    if (output > 256) {
      await assert.rejects(pending, { message: 'MiniMax probe refused or failed; no public result.' });
      await noResult(config);
      await assert.rejects(probeOnce({ ...config, fetchImpl: () => { calls++; } }));
    } else {
      assert.deepEqual((await pending).usage, value.usage);
    }
    assert.equal(calls, 1);
  }
});

test('usage is optional and unknown usage fields never reach the safe summary', async t => {
  for (const usage of [undefined, { input_tokens: 0, unknown: 'do not publish' }]) {
    const config = await fixture(t); const value = good(); value.usage = usage;
    const safe = await probeOnce({ ...config, fetchImpl: async () => response(value) });
    assert.deepEqual(safe.usage, usage ? { input_tokens: 0 } : {});
  }
});

test('missing config and repository-local output refuse before HTTP', async t => {
  const config = await fixture(t); let calls = 0;
  for (const override of [{ apiKey: undefined }, { apiKey: '' }, { apiKey: 'bad\nkey' },
    { scratchDir: 'relative' }, { scratchDir: path.join(config.repoDir, 'scratch') }, { repoDir: undefined }]) {
    await assert.rejects(probeOnce({ ...config, ...override, fetchImpl: () => { calls++; } }));
  }
  assert.equal(calls, 0);
});

test('CLI is disabled by default, rejects arbitrary flags, and missing runtime config is generic', async () => {
  for (const args of [[], ['--execute-once'], ['--execute-once', '--model', 'anything']]) {
    const messages = [];
    assert.equal(await main(args, {}, message => messages.push(message)), 1);
    assert.deepEqual(messages, ['MiniMax probe disabled, refused, or failed; no public result.\n']);
  }
});

test('manual workflow strictly isolates MiniMax credentials and execution authority', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/news-isolated-dry-run.yml', import.meta.url), 'utf8');
  const header = workflow.slice(0, workflow.indexOf('\njobs:\n'));
  assert.deepEqual([...header.matchAll(/^  ([a-z_]+):/gm)].map(m => m[1]), ['workflow_dispatch', 'contents']);
  assert.match(header, /minimax_probe:[\s\S]*?type: boolean\n        default: false/);
  assert.match(header, /\npermissions:\n  contents: read\n?$/);
  assert.doesNotMatch(workflow, /schedule:|\bwrite\b|pull_request_target|id-token:|news-publish|--publish|production-enable|gh pr|git push|vercel|sync-news\.mjs/);
  const jobs = [...workflow.matchAll(/^  ([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/gm)]
    .filter(m => workflow.indexOf(m[0]) > workflow.indexOf('\njobs:\n'));
  assert.deepEqual(jobs.map(m => m[1]), ['fixture-dry-run', 'minimax-probe', 'sdk-sandbox']);
  const probe = jobs[1][2];
  assert.match(probe, /^    needs: fixture-dry-run$/m);
  assert.match(probe, /^    environment: opencard-migration-sandbox$/m);
  assert.match(probe, /^    if: github.repository == 'opencard-ai\/opencard' && github.ref == 'refs\/heads\/bot\/opencard-durable-runner-prep' && github.event_name == 'workflow_dispatch' && inputs.minimax_probe == true && inputs.sdk_sandbox != true && needs.fixture-dry-run.result == 'success'$/m);
  const [settings, ...steps] = probe.split(/^      - /m);
  assert.doesNotMatch(settings, /env:|secrets\.|permissions:/);
  assert.equal(steps.length, 6);
  for (const action of ['checkout', 'setup-node', 'upload-artifact']) {
    assert.match(probe, new RegExp(`actions/${action}@[0-9a-f]{40} # v4`));
  }
  assert.match(steps[0], /persist-credentials: false\n          ref: \$\{\{ github.sha \}\}/);
  const guard = steps[2];
  assert.match(guard, /EXPECTED_SHA: \$\{\{ inputs.expected_sha \}\}/);
  for (const assertion of [
    "assert.equal(process.env.GITHUB_REPOSITORY,'opencard-ai/opencard');",
    "assert.equal(process.env.GITHUB_REF,'refs/heads/bot/opencard-durable-runner-prep');",
    "assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');",
    "assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');",
    'assert.match(process.env.EXPECTED_SHA,/^[0-9a-f]{40}$/);',
    'assert.equal(process.env.GITHUB_SHA,process.env.EXPECTED_SHA);',
    "assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),process.env.EXPECTED_SHA);",
  ]) assert.ok(guard.includes(assertion), assertion);
  assert.match(steps[3], /run: env -i PATH="\$PATH" node --test scripts\/automation\/minimax-probe.check.mjs\n$/);
  assert.equal(steps[4], 'name: One public-title generation using runtime-only repository secret\n' +
    '        env:\n          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}\n' +
    '        run: node scripts/automation/minimax-probe.mjs --execute-once\n');
  // Whole-workflow check also covers fixture, SDK, workflow env and all other steps.
  assert.doesNotMatch(workflow.replace(steps[4], ''), /MINIMAX_API_KEY/);
  assert.deepEqual([...probe.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]), ['MINIMAX_API_KEY']);
  assert.doesNotMatch(probe, /\bnpm\b|\binstall\b|\bbuild\b|GITHUB_ENV|GITHUB_OUTPUT|continue-on-error|if: always/);
  assert.match(steps[5], /path: \$\{\{ runner.temp \}\}\/minimax-probe-once\/result.json\n          retention-days: 7\n          if-no-files-found: error\n$/);
  assert.doesNotMatch(steps[5], /env:|if:|\*|attempt\.ledger/);
});
