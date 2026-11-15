import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluate, main } from './ops-watchdog.mjs';

const now = '2026-11-17T15:23:00Z';
const run = (created_at, patch = {}) => ({ id: 123, head_branch: 'main', event: 'schedule', status: 'completed', conclusion: 'success', created_at, ...patch });
const runs = (...workflow_runs) => ({ workflow_runs });
const good = { offerRuns: runs(run('2026-11-16T19:23:00Z')), auditRuns: runs(run('2026-11-16T19:00:00Z')), now };
test('offer 20h ago and Monday audit success produce exact NO_REPLY', () => {
  const r = evaluate(good);
  assert.equal(r.offer, 'ok'); assert.equal(r.audit, 'ok'); assert.equal(r.text, 'NO_REPLY'); assert.equal(r.pt_date, '2026-11-17');
});
for (const patch of [{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { event: 'pull_request' }, { head_branch: 'topic' }, { status: 'in_progress', conclusion: null }]) test(`nonqualifying run ${JSON.stringify(patch)}`, () => {
  const bad = runs(run('2026-11-16T19:23:00Z', patch));
  const r = evaluate({ ...good, offerRuns: bad, auditRuns: bad });
  assert.equal(r.offer, 'missed'); assert.equal(r.audit, 'missed');
});
test('offer window is open at 36h and closed at now; dispatch success counts for both jobs', () => {
  for (const hours of [36, 37]) assert.equal(evaluate({ ...good, offerRuns: runs(run(new Date(Date.parse(now) - hours * 3600000).toISOString())) }).offer, 'missed');
  assert.equal(evaluate({ ...good, offerRuns: runs(run(now)) }).offer, 'ok');
  assert.equal(evaluate({ ...good, offerRuns: runs(run('2026-11-18T00:00:00Z')) }).offer, 'missed');
  const r = evaluate({ ...good, offerRuns: runs(run(now, { event: 'workflow_dispatch' })), auditRuns: runs(run(now, { event: 'workflow_dispatch' })) });
  assert.equal(r.offer, 'ok'); assert.equal(r.audit, 'ok');
});
test('audit is pending Monday and early Tuesday, then requires this UTC week', () => {
  for (const time of ['2026-11-16T00:00:00Z', '2026-11-16T19:00:00Z', '2026-11-17T14:46:59Z']) assert.equal(evaluate({ ...good, now: time, auditRuns: runs() }).audit, 'pending');
  assert.equal(evaluate({ ...good, now: '2026-11-17T14:47:00Z', auditRuns: runs() }).audit, 'missed');
  for (const auditRuns of [runs(), runs(run('2026-11-09T19:00:00Z'))]) assert.equal(evaluate({ ...good, now: '2026-11-18T15:23:00Z', auditRuns }).audit, 'missed');
});
test('fixed alert text exact match, includes only missed lines and PT date', () => {
  assert.equal(evaluate({ ...good, offerRuns: runs(), auditRuns: runs() }).text,
    '[MISSED] OpenCard ops watchdog 2026-11-17\n- offer-watch: no successful scheduled/dispatched run on main in the last 36h (latest success: none).\n- weekly-audit: no successful run on main since 2026-11-16T00:00:00.000Z (slot 2026-11-16T18:47:00.000Z + 20h grace passed).\nNo automatic catch-up was started. See the run link.\n');
  const r = evaluate({ ...good, offerRuns: runs(run('2026-11-15T19:23:00Z')) });
  assert.match(r.text, /latest success: 2026-11-15T19:23:00.000Z/); assert.doesNotMatch(r.text, /- weekly-audit/);
  assert.doesNotMatch(evaluate({ ...good, auditRuns: runs() }).text, /- offer-watch/);
  assert.equal(evaluate({ ...good, now: '2026-11-17T01:00:00Z' }).pt_date, '2026-11-16');
});
test('malformed inputs fail closed', () => {
  for (const offerRuns of [null, [], {}, { workflow_runs: {} }, runs(null), runs({}), runs(run('bad'))]) assert.throws(() => evaluate({ ...good, offerRuns }));
  assert.throws(() => evaluate({ ...good, now: 'bad' }));
});
test('CLI writes exact NO_REPLY and statuses, malformed input exits 2 without summary', t => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-watchdog-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const offer = path.join(d, 'offer.json'), audit = path.join(d, 'audit.json'), out = path.join(d, 'out');
  fs.writeFileSync(offer, JSON.stringify(good.offerRuns)); fs.writeFileSync(audit, JSON.stringify(good.auditRuns));
  const argv = ['--offer-runs', offer, '--audit-runs', audit, '--now', now, '--out-dir', out];
  assert.equal(main(argv), 0); assert.equal(fs.readFileSync(path.join(out, 'watchdog.txt'), 'utf8'), 'NO_REPLY');
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'watchdog.json'))).audit, 'ok');
  fs.rmSync(out, { recursive: true }); fs.writeFileSync(offer, '{');
  assert.equal(main(argv), 2); assert.equal(fs.existsSync(out), false);
  const r = spawnSync(process.execPath, ['scripts/automation/ops-watchdog.mjs', ...argv], { encoding: 'utf8' });
  assert.ifError(r.error); assert.equal(r.status, 2); assert.equal(fs.existsSync(out), false);
});
test('workflow has UTC schedule, read permissions, pinned actions and guarded notify/secrets', () => {
  const wf = fs.readFileSync('.github/workflows/ops-watchdog.yml', 'utf8');
  assert.match(wf, /cron: '23 15 \* \* \*'/); assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /permissions:\n  contents: read/); assert.match(wf, /actions: read/);
  assert.doesNotMatch(wf, /\bwrite\b|gh workflow run|secrets: inherit/);
  assert.match(wf, /persist-credentials: false/);
  for (const pin of ['11d5960a326750d5838078e36cf38b85af677262', '49933ea5288caeca8642d1e84afbd3f7d6820020', 'ea165f8d65b6e75b540449e92b4886f43607fa02']) assert.ok(wf.includes(pin));
  const notify = wf.split('  notify:')[1];
  assert.match(notify, /if: \$\{\{ !startsWith\(github.event_name, 'pull_request'\) && github.ref == 'refs\/heads\/main' \}\}/);
  assert.match(notify, /send: \$\{\{ github.ref == 'refs\/heads\/main' && !startsWith\(github.event_name, 'pull_request'\) \}\}/);
  for (const name of ['AGENTMAIL_API_KEY', 'AGENTMAIL_FROM_INBOX', 'OWNER_EMAIL']) assert.ok(notify.includes(`${name}: \${{ !startsWith(github.event_name, 'pull_request') && secrets.${name} || '' }}`));
  assert.match(notify, /job: ops-watchdog/); assert.match(notify, /kind: missed/); assert.match(notify, /summary_file: watchdog.txt/);
  assert.ok(wf.includes('runs?branch=main&per_page=50'));
  const pr = wf.split('  pull_request:')[1].split('permissions:')[0];
  for (const file of ['.github/workflows/ops-watchdog.yml', 'scripts/automation/ops-watchdog.mjs', 'scripts/automation/ops-watchdog.test.mjs']) assert.ok(pr.includes(file));
  assert.match(wf, /run: node --test scripts\/automation\/ops-watchdog.test.mjs/);
});
