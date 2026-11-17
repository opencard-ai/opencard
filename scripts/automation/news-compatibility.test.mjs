import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { legacySync } from '../sync-news.mjs';
import { createMiniMaxTranslator } from '../news-provider.mjs';
import { observeNewsDeployment } from './news-publish.mjs';
import { createVercelDeploymentReader } from './vercel-observer.mjs';
import { publicationExitCode } from './news-publish-cli.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/news.json', import.meta.url)));
const items = [{ title: 'One' }, { title: 'Two' }];
const head = 'a'.repeat(40);
const api = value => async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(value) }] }) });

test('legacy provider preserves partial/missing translation fallback; strict policy remains opt-in', async () => {
  const fetchImpl = api([{ idx: 0, title: '一', summary: '摘要' }]);
  const legacy = createMiniMaxTranslator({ apiKey: 'synthetic', fetchImpl, failureMode: 'legacy-fallback' });
  const result = await legacy(items, 'zh');
  assert.equal(result[0].title_zh, '一');
  assert.equal(result[1].title_zh, 'Two'); assert.equal(result[1].summary_zh, '');
  await assert.rejects(createMiniMaxTranslator({ apiKey: 'synthetic', fetchImpl })(items, 'zh'));
  for (const unavailable of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ content: [{ text: 'not JSON' }] }) }), async () => new Promise(() => {})]) {
    const fallback = await createMiniMaxTranslator({ apiKey: 'synthetic', fetchImpl: unavailable, timeoutMs: 5, failureMode: 'legacy-fallback' })(items, 'zh');
    assert.deepEqual(fallback.map(i => [i.title_zh, i.summary_zh]), [['One', ''], ['Two', '']]);
  }
  // Old code throws when the credential itself is absent, before its fallback try/catch.
  await assert.rejects(createMiniMaxTranslator({ apiKey: '', failureMode: 'legacy-fallback' })(items, 'zh'), /credential/);
});

test('legacy sync keeps fallback retryable and atomic output survives partial write/source failure', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-news-test-'));
  fs.mkdirSync(path.join(cwd, 'data'));
  const file = path.join(cwd, 'data/news.json');
  fs.writeFileSync(file, JSON.stringify({ items: [] }));
  const fetchImpl = async url => String(url).includes('minimax') ? { ok: false } : { ok: true, text: async () => fixture.sources[0].rss };
  const options = { cwd, apiKey: 'synthetic', fetchImpl, now: new Date('2026-11-06T20:00:00Z') };
  try {
    await legacySync(options);
    const fallback = JSON.parse(fs.readFileSync(file));
    assert.equal(fallback.items[0].title_zh, fallback.items[0].title);
    assert.equal(fallback.items[0].summary_zh, '');
    const before = fs.readFileSync(file, 'utf8');
    const successfulFetch = async url => String(url).includes('minimax') ? { ok: true, json: async () => ({ content: [{ text: '[{"idx":0,"title":"translated","summary":"complete"}]' }] }) } : { ok: true, text: async () => fixture.sources[0].rss };
    const brokenFs = { ...fs, writeFileSync: (target, data, ...rest) => {
      if (String(target).endsWith('.tmp')) { fs.writeFileSync(target, 'partial'); throw new Error('synthetic disk failure'); }
      return fs.writeFileSync(target, data, ...rest);
    } };
    await assert.rejects(legacySync({ ...options, fetchImpl: successfulFetch, fsImpl: brokenFs }));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.readdirSync(path.join(cwd, 'data')).length, 1);
    await assert.rejects(legacySync({ ...options, fetchImpl: async () => ({ ok: false, status: 503 }) }));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    await legacySync({ ...options, fetchImpl: successfulFetch });
    assert.equal(JSON.parse(fs.readFileSync(file)).items[0].title_zh, 'translated');
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('symlinked legacy CLI actually runs with mocked RSS/model; symlinked publisher fails disabled', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'news-symlink-test-'));
  fs.mkdirSync(path.join(cwd, 'data'));
  fs.writeFileSync(path.join(cwd, 'data/news.json'), '{"items":[]}');
  const preload = path.join(cwd, 'mock-network.mjs');
  fs.writeFileSync(preload, `const RealDate=Date; globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:['2026-11-06T20:00:00Z']))} static now(){return RealDate.parse('2026-11-06T20:00:00Z')} }; globalThis.fetch=async url=>String(url).includes('minimax')?{ok:false}:{ok:true,text:async()=>${JSON.stringify(fixture.sources[0].rss)}};`);
  const sync = path.join(cwd, 'sync-via-link.mjs'), publish = path.join(cwd, 'publish-via-link.mjs');
  fs.symlinkSync(fileURLToPath(new URL('../sync-news.mjs', import.meta.url)), sync);
  fs.symlinkSync(fileURLToPath(new URL('./news-publish-cli.mjs', import.meta.url)), publish);
  try {
    const stdout = execFileSync(process.execPath, ['--import', preload, sync], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, MINIMAX_API_KEY: 'synthetic' } });
    assert.match(stdout, /Written/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, 'data/news.json'))).items.length, 1);
    const result = spawnSync(process.execPath, ['--import', preload, publish], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(result.status, 1); assert.match(result.stderr, /disabled/);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('bounded production observer rejects preview/wrong SHA/not READY and can poll to exact production+digest', async () => {
  const proposed = { items: [], fetched: 'fixed' };
  const run = async () => ({ code: 0, stdout: JSON.stringify({ sha: head, statuses: [{ context: 'Vercel', state: 'success' }] }) });
  const ready = { name: 'opencard', target: 'production', meta: { githubCommitSha: head }, readyState: 'READY' };
  const fetchLive = async () => ({ status: 200, data: proposed });
  for (const bad of [{ ...ready, target: 'preview' }, { ...ready, meta: { githubCommitSha: 'b'.repeat(40) } }, { ...ready, readyState: 'BUILDING' }]) {
    assert.equal(await observeNewsDeployment({ mergeSha: head, proposed, run, fetchLive, fetchDeployment: async () => [bad], timeoutMs: 1, pollMs: 1, sleep: async () => {} }), 'UNCONFIRMED');
  }
  let reads = 0, clock = 0;
  assert.equal(await observeNewsDeployment({ mergeSha: head, proposed, run, fetchLive, fetchDeployment: async () => ++reads < 2 ? [{ ...ready, readyState: 'BUILDING' }] : [ready], now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 10, pollMs: 1 }), 'VERIFIED');
  assert.equal(reads, 2);
});

test('official Vercel adapter filters production/exact SHA and redacts failures, no live calls', async () => {
  let request;
  const read = createVercelDeploymentReader({ token: 'synthetic', fetchImpl: async url => { request = new URL(url); return { ok: true, json: async () => ({ deployments: [] }) }; } });
  assert.deepEqual(await read(head), []);
  assert.equal(request.pathname, '/v7/deployments'); assert.equal(request.searchParams.get('sha'), head); assert.equal(request.searchParams.get('target'), 'production');
  await assert.rejects(createVercelDeploymentReader({ token: 'synthetic-private', fetchImpl: async () => { throw new Error('synthetic-private'); } })(head), error => !error.message.includes('synthetic-private'));
  assert.throws(() => createVercelDeploymentReader({ token: '' }), /promotion blocked/);
});

test('UNCONFIRMED publication is a nonzero exit, not deployment success', () => {
  assert.equal(publicationExitCode({ state: 'MERGED', deployment: 'UNCONFIRMED' }), 1);
  assert.equal(publicationExitCode({ state: 'EXISTING_PR_RECONCILE' }), 1);
  assert.equal(publicationExitCode({ state: 'MERGED', deployment: 'VERIFIED' }), 0);
});
