import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alreadySent, buildMessage, dedupeKey, gateSend, isSilent, sanitize, sendViaAgentMail, MAX_CHARS } from './ops-notify-core.mjs';
import { main } from './ops-notify.mjs';

// Token-like fixtures are assembled at runtime so no secret-shaped literal is committed (gitleaks).
const rnd = (n, set = 'AbCdEfGh12345678') => Array.from({ length: n }, (_, i) => set[(i * 7 + 3) % set.length]).join('');
const fakeGh = 'ghp' + '_' + rnd(36);
const fakePat = 'github' + '_pat_' + rnd(40);
const fakeAws = 'AK' + 'IA' + 'ABCDEFGH12345678';
const fakeJwt = 'ey' + 'J' + rnd(20) + '.ey' + 'J' + rnd(20) + '.' + rnd(24);
const fakeSk = 's' + 'k-' + rnd(32);
const fakeSlack = 'xo' + 'xb-' + '1234567890-' + rnd(16);
const fakeEntropy = rnd(40, 'aZ9bY8cX7');
const fixture = fs.readFileSync(new URL('./fixtures/ops-notify-summary.txt', import.meta.url), 'utf8');

test('silence: NO_REPLY, DURABLE:NO_REPLY and empty are not announced', () => {
  for (const s of ['NO_REPLY', ' NO_REPLY\n', 'DURABLE:NO_REPLY', '', '   ', null]) assert.equal(isSilent(s), true);
  assert.equal(isSilent('NO_REPLY but more'), false);
  assert.equal(buildMessage({ job: 'offer-watch', ptDate: '2026-11-13', runId: '1', summary: 'NO_REPLY\n' }).skip, true);
});

test('sanitizer redacts token-like strings', () => {
  for (const tok of [fakeGh, fakePat, fakeAws, fakeJwt, fakeSk, fakeSlack, fakeEntropy]) {
    const out = sanitize(`line ${tok} end`);
    assert.ok(!out.includes(tok), `leaked ${tok.slice(0, 6)}`);
    assert.match(out, /\[redacted-token\]/);
  }
  assert.equal(sanitize('Authorization: Bearer ' + rnd(30)).includes('Bearer'), false);
  assert.match(sanitize('api_key=' + rnd(12)), /api_key=\[redacted\]/);
  assert.match(sanitize('MY_SECRET: "' + rnd(10) + '"'), /MY_SECRET: \[redacted\]/);
  assert.match(sanitize('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'), /^\[redacted-key\]$/);
});

test('sanitizer strips URL credentials and sensitive query params but keeps normal URLs', () => {
  const out = sanitize('see https://user:' + 'pw123' + '@example.com/a?x=1&token=' + rnd(10) + '&sig=abc and https://www.americanexpress.com/us/credit-cards/card/gold-card/');
  assert.ok(!out.includes('user:') && !out.includes('pw123'));
  assert.match(out, /https:\/\/example\.com\/a\?x=1&token=\[redacted\]&sig=\[redacted\]/);
  assert.match(out, /https:\/\/www\.americanexpress\.com\/us\/credit-cards\/card\/gold-card\//);
});

test('sanitizer redacts non-allowlisted emails, local paths, control chars; keeps card ids and hex SHAs', () => {
  const sha = 'a1b2c3d4'.repeat(5);
  const out = sanitize(`\u001b[31mred\u001b[0m kc@example.com opencard@opencardai.com /Users/someone/x.log ~/.openclaw/state amex-delta-skymiles-reserve-biz ${sha}\u0007`);
  assert.ok(!out.includes('kc@example.com') && out.includes('[redacted-email]'));
  assert.ok(out.includes('opencard@opencardai.com'));
  assert.ok(!out.includes('/Users/someone') && !out.includes('~/.openclaw'));
  assert.ok(out.includes('amex-delta-skymiles-reserve-biz') && out.includes(sha));
  assert.ok(!/[\u0000-\u0008\u001b]/.test(out) && out.startsWith('red '));
});

test('sanitizer caps length and lines', () => {
  const long = sanitize('x'.repeat(10) + '\n' + 'y '.repeat(5000));
  assert.ok(long.length <= MAX_CHARS + 40 && long.endsWith('（已截斷；完整報告見 GitHub Actions run）'));
  const many = sanitize(Array.from({ length: 200 }, (_, i) => `l${i}`).join('\n'));
  assert.ok(many.split('\n').length <= 81);
  assert.equal(sanitize(fixture), fixture.trim());
});

test('dedupe key validates inputs and ignores attempt', () => {
  assert.equal(dedupeKey({ job: 'weekly-audit', ptDate: '2026-11-16', runId: '123' }), 'ops-notify:weekly-audit:2026-11-16:123');
  for (const bad of [{ job: 'x', ptDate: '2026-11-16', runId: '1' }, { job: 'offer-watch', ptDate: '11/16', runId: '1' }, { job: 'offer-watch', ptDate: '2026-11-16', runId: 'a b' }]) assert.throws(() => dedupeKey(bad));
  assert.equal(alreadySent(['ops-notify:offer-watch:2026-11-13:1'], 'ops-notify:offer-watch:2026-11-13:1'), true);
  assert.equal(alreadySent(null, 'k'), false);
});

test('message contains only sanitized summary, validated run link and dedupe key', () => {
  const m = buildMessage({ job: 'offer-watch', ptDate: '2026-11-13', runId: '42', summary: `${fixture}\n${fakeGh}`, runUrl: 'https://github.com/opencard-ai/opencard/actions/runs/42' });
  assert.equal(m.subject, '[OpenCard 優惠監測] 2026-11-13 run 42');
  assert.ok(!m.text.includes(fakeGh) && m.text.includes('actions/runs/42') && m.text.endsWith('(dedupe: ops-notify:offer-watch:2026-11-13:42)'));
  assert.ok(!buildMessage({ job: 'offer-watch', ptDate: '2026-11-13', runId: '42', summary: fixture, runUrl: 'https://evil.example/x' }).text.includes('evil'));
  assert.ok(!m.html.includes('<script') && m.html.startsWith('<pre'));
});

test('send gate: preview unless --send AND OPS_NOTIFY_SEND=true AND all secret names present', () => {
  const full = { OPS_NOTIFY_SEND: 'true', AGENTMAIL_API_KEY: 'x', AGENTMAIL_FROM_INBOX: 'y', OWNER_EMAIL: 'z' };
  assert.equal(gateSend({ sendFlag: false, env: full }).send, false);
  assert.equal(gateSend({ sendFlag: true, env: { ...full, OPS_NOTIFY_SEND: 'false' } }).send, false);
  assert.equal(gateSend({ sendFlag: true, env: { ...full, OPS_NOTIFY_SEND: '1' } }).send, false);
  const missing = gateSend({ sendFlag: true, env: { OPS_NOTIFY_SEND: 'true' } });
  assert.equal(missing.send, false); assert.equal(missing.error, true);
  assert.equal(gateSend({ sendFlag: true, env: full }).send, true);
});

test('sendViaAgentMail posts once with mocked fetch and hides error bodies', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const msg = buildMessage({ job: 'weekly-audit', ptDate: '2026-11-16', runId: '7', summary: 'hello' });
  await sendViaAgentMail({ fetchImpl: ok, apiKey: 'k', inboxId: 'inbox/x', to: 'o@example.com', message: msg });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.agentmail.to/v0/inboxes/inbox%2Fx/messages/send');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ['o@example.com']);
  const bad = async () => ({ ok: false, status: 401, text: async () => 'body with secret' });
  await assert.rejects(sendViaAgentMail({ fetchImpl: bad, apiKey: 'k', inboxId: 'i', to: 't', message: msg }), e => e.message === 'AgentMail send failed: HTTP 401');
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ops-notify-')); }
const base = (dir, extra = []) => ['--job', 'offer-watch', '--pt-date', '2026-11-13', '--run-id', '99', '--summary-file', new URL('./fixtures/ops-notify-summary.txt', import.meta.url).pathname, '--out-dir', dir, ...extra];
const noFetch = async () => { throw new Error('network must not be used'); };

test('CLI default is preview: writes preview + record, never calls fetch', async () => {
  const d = tmp();
  assert.equal(await main(base(d), { AGENTMAIL_API_KEY: 'k', AGENTMAIL_FROM_INBOX: 'i', OWNER_EMAIL: 'o@example.com' }, noFetch), 0);
  const rec = JSON.parse(fs.readFileSync(path.join(d, 'notify-record.json'), 'utf8'));
  assert.equal(rec.status, 'preview'); assert.equal(rec.mode, 'preview');
  assert.match(fs.readFileSync(path.join(d, 'notify-preview.md'), 'utf8'), /\*\*Subject:\*\* \[OpenCard 優惠監測\] 2026-11-13 run 99/);
  assert.equal(await main(base(d, ['--send']), {}, noFetch), 0, '--send without OPS_NOTIFY_SEND stays preview');
});

test('CLI: refuses when send enabled but secrets missing; skips already-sent; sends once with mock; send failure exits 1', async () => {
  const env = { OPS_NOTIFY_SEND: 'true', AGENTMAIL_API_KEY: 'k', AGENTMAIL_FROM_INBOX: 'i', OWNER_EMAIL: 'o@example.com' };
  assert.equal(await main(base(tmp(), ['--send']), { OPS_NOTIFY_SEND: 'true' }, noFetch), 2);
  const d = tmp(); fs.writeFileSync(path.join(d, 'sent.json'), JSON.stringify(['ops-notify:offer-watch:2026-11-13:99']));
  assert.equal(await main(base(d, ['--send', '--sent-keys', path.join(d, 'sent.json')]), env, noFetch), 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'notify-record.json'))).status, 'skipped:already_sent');
  let n = 0; const mock = async () => { n++; return { ok: true, status: 200 }; };
  const d2 = tmp(); assert.equal(await main(base(d2, ['--send']), env, mock), 0); assert.equal(n, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d2, 'notify-record.json'))).status, 'sent');
  const d3 = tmp(); assert.equal(await main(base(d3, ['--send']), env, async () => ({ ok: false, status: 500 })), 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d3, 'notify-record.json'))).status, 'send_failed');
  assert.equal(await main(base(tmp(), ['--record-ops-state']), env, noFetch), 2, 'ops-state write is stubbed off');
});

test('CLI: NO_REPLY summary is skipped without network', async () => {
  const d = tmp(); const f = path.join(d, 's.txt'); fs.writeFileSync(f, 'NO_REPLY\n');
  assert.equal(await main(['--job', 'weekly-audit', '--pt-date', '2026-11-16', '--run-id', '5', '--summary-file', f, '--out-dir', d, '--send'], { OPS_NOTIFY_SEND: 'true' }, noFetch), 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'notify-record.json'))).status, 'skipped:no_reply');
});

test('sanitizer: JSON-quoted secret fields and percent-encoded query names are redacted', () => {
  const pw = 'hun' + 'ter2', ak = 'sample' + 'abcdef1234';
  const out = sanitize(`{"password":"${pw}","api_key": "${ak}", "note":"ok"}`);
  assert.ok(!out.includes(pw) && !out.includes(ak) && out.includes('"note":"ok"'));
  assert.match(out, /"password":\[redacted\]/);
  const esc = sanitize(`{"client_secret":"a\\"b${ak}"}`);
  assert.ok(!esc.includes(ak));
  const enc = sanitize(`https://example.com/?%74oken=${ak}&page=2#access_token=${ak}`);
  assert.ok(!enc.includes(ak) && enc.includes('page=2'));
});

test('CLI: missing summary file fails; send error record holds only a category', async () => {
  const d = tmp();
  assert.equal(await main(['--job', 'offer-watch', '--pt-date', '2026-11-13', '--run-id', '1', '--summary-file', path.join(d, 'nope.txt'), '--out-dir', d], {}, noFetch), 2);
  const env = { OPS_NOTIFY_SEND: 'true', AGENTMAIL_API_KEY: 'k-secret-value', AGENTMAIL_FROM_INBOX: 'i', OWNER_EMAIL: 'o@example.com' };
  const d2 = tmp();
  assert.equal(await main(base(d2, ['--send']), env, async () => { throw new Error('header contains k-secret-value'); }), 1);
  const rec = fs.readFileSync(path.join(d2, 'notify-record.json'), 'utf8');
  assert.ok(!rec.includes('k-secret-value')); assert.equal(JSON.parse(rec).error, 'client_or_network_error');
});

test('workflow: preview job references no secrets; send job excludes pull_request callers and requires main + send', () => {
  const wf = fs.readFileSync(new URL('../../.github/workflows/ops-notify.yml', import.meta.url), 'utf8');
  const [, preview, send] = wf.split(/\n  (?=preview:|send:)/);
  assert.ok(preview.startsWith('preview:') && send.startsWith('send:'));
  assert.doesNotMatch(preview, /\$\{\{\s*secrets\./);
  assert.match(send, /if: inputs\.send == true && github\.ref == 'refs\/heads\/main' && !startsWith\(github\.event_name, 'pull_request'\)/);
  assert.doesNotMatch(wf, /^\s+schedule:/m);
  assert.match(wf, /send:\n        description: [^\n]*\n        type: boolean\n        default: false/);
});

test('sanitizer: paths after full-width punctuation are replaced; URL paths are not', () => {
  assert.equal(sanitize('完整報告：/home/runner/work/_temp/audit/x.md'), '完整報告：[path]');
  assert.equal(sanitize('https://example.com/home/page'), 'https://example.com/home/page');
});
