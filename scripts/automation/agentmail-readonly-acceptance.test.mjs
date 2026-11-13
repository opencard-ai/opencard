import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runAcceptance, buildRequest, ORIGIN, PATH } from './agentmail-readonly-acceptance.mjs';

const KEY = 'am_test_key_0123456789abcdef';
const secretMsg = { message_id: 'MSGID-SECRET', from: 'alice@private.example', subject: 'SECRET SUBJECT', preview: 'SECRET PREVIEW', text: 'SECRET BODY', timestamp: '2026-11-07T10:00:00.000Z', labels: ['unread'], private_message_id_123: 'x' };
const run = async (fetchImpl, env = { AGENTMAIL_API_KEY: KEY }) => { const out = []; const code = await runAcceptance({ env, fetchImpl, print: s => out.push(s) }); return { code, out: out.join('\n') }; };
const okFetch = (calls) => async (u, i) => { calls.push({ u, i }); return new Response(JSON.stringify({ count: 3, limit: 1, next_page_token: 'TOKEN-SECRET', messages: [secretMsg] }), { status: 200 }); };

test('exactly one GET to the fixed origin/path, limit=1, redirect error, no body; allowlisted output only', async () => {
  const calls = []; const { code, out } = await run(okFetch(calls));
  assert.equal(code, 0); assert.equal(calls.length, 1);
  const u = new URL(calls[0].u);
  assert.equal(u.origin, ORIGIN); assert.equal(u.pathname, '/v0/inboxes/opencard%40agentmail.to/messages'); assert.equal(u.search, '?limit=1');
  assert.equal(calls[0].i.method, 'GET'); assert.equal(calls[0].i.redirect, 'error'); assert.equal(calls[0].i.body, undefined);
  const s = JSON.parse(out);
  assert.deepEqual(Object.keys(s).sort(), ['count', 'exit', 'keys', 'latestTimestamp', 'messageKeys', 'ok', 'returned', 'status']);
  assert.equal(s.count, 3); assert.equal(s.returned, 1); assert.equal(s.latestTimestamp, '2026-11-07T10:00:00.000Z');
  assert.ok(!out.includes('private_message_id_123'));
  for (const bad of ['SECRET', 'alice', 'MSGID', 'TOKEN-SECRET', KEY]) assert.ok(!out.includes(bad), bad);
});

test('fail closed and redacted: http error, network error, bad json, missing key, redirect', async () => {
  for (const f of [
    async () => new Response('{"error":"SECRET detail alice@private.example"}', { status: 403 }),
    async () => { throw new Error(`ECONNRESET ${KEY} alice@private.example`); },
    async () => new Response('not json SECRET', { status: 200 }),
    async () => new Response(JSON.stringify({ messages: 'x' }), { status: 200 }),
    async () => { throw new TypeError('fetch failed: redirect mode is set to error'); },
  ]) { const { code, out } = await run(f); assert.equal(code, 1); assert.ok(!/SECRET|alice|ECONNRESET/.test(out) && !out.includes(KEY), out); }
  for (const env of [{}, { AGENTMAIL_API_KEY: 'short' }, { AGENTMAIL_API_KEY: 'has space 0123456789' }]) {
    let called = false; const { code } = await run(async () => { called = true; }, env); assert.equal(code, 2); assert.equal(called, false);
  }
});

test('static: no write verbs, no other endpoints, no retry loop in the entrypoint', () => {
  const src = fs.readFileSync(new URL('./agentmail-readonly-acceptance.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /method:\s*'(POST|PUT|PATCH|DELETE)'|\/send|\/reply|\/forward|\/attachments|\/drafts|update_message|labels'?\s*:|for\s*\(|while\s*\(|retry/i);
  assert.equal((src.match(/fetchImpl\(/g) || []).length, 1);
  assert.equal(PATH, '/v0/inboxes/opencard%40agentmail.to/messages');
  assert.throws(() => buildRequest(undefined));
});

test('workflow contract: agentmail job manual, gated env, secret only in last step, no artifacts', () => {
  const y = fs.readFileSync(new URL('../../.github/workflows/news-isolated-dry-run.yml', import.meta.url), 'utf8');
  const job = y.slice(y.indexOf('  ops-agentmail-readonly:'), y.indexOf('  ops-audit-readonly:'));
  assert.ok(y.includes('  ops-agentmail-readonly:'));
  assert.match(job, /environment: ops-agentmail-readonly/); assert.match(job, /contents: read/); assert.match(job, /persist-credentials: false/);
  assert.ok(!job.includes('upload-artifact'));
  const s = job.indexOf('secrets.');
  assert.ok(s > job.indexOf('npm ci') && s > job.indexOf('Offline preflight'));
  assert.deepEqual([...new Set(job.match(/secrets\.[A-Z_]+/g))], ['secrets.AGENTMAIL_API_KEY']);
  assert.match(y, /ops_agentmail_readonly:[\s\S]*?default: false/);
});
