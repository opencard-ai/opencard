import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAcceptance } from './gsc-readonly-acceptance.mjs';

const SECRET = 'SYNTHETIC-SECRET-VALUE-123';
const env = (o = {}) => ({ PATH: process.env.PATH, HOME: '/h', GSC_CLIENT_ID: 'cid-' + SECRET, GSC_CLIENT_SECRET: SECRET, GSC_TOKEN_JSON: JSON.stringify({ refresh_token: SECRET, access_token: SECRET }), ...o });
function fakeSpawn(write, status = 0, seen = {}) {
  return (_bin, args, opts) => {
    seen.args = args; seen.env = opts.env; seen.tokenMode = fs.statSync(opts.env.OPENCARD_GSC_TOKEN_PATH).mode & 0o777; seen.dir = opts.env.OPENCARD_GSC_STATE_DIR;
    if (write) write(opts.env.OPENCARD_GSC_STATE_DIR);
    return { status, stdout: `clicks 42 query "${SECRET}"`, stderr: `error body ${SECRET}` };
  };
}
const hist = (d, last) => fs.writeFileSync(path.join(d, '.gsc-report-history.json'), JSON.stringify([last]));

test('success prints only allowlisted summary, no metrics/secrets; temp cleaned; token 0600', () => {
  const out = [], seen = {};
  const rc = runAcceptance({ env: env(), print: (s) => out.push(s), spawn: fakeSpawn((d) => { hist(d, { date: '2026-11-08', clicks: 42, impressions: 999, period: { startDate: '2026-10-31', endDate: '2026-11-06' }, topPages: [{ url: 'https://opencardai.com/x' }] }); fs.writeFileSync(path.join(d, '.gsc-cohort-baseline.json'), '{}'); }, 0, seen) });
  assert.equal(rc, 0);
  assert.equal(out.length, 1);
  const s = JSON.parse(out[0]);
  assert.deepEqual(Object.keys(s).sort(), ['baselineCreated', 'entries', 'exit', 'keys', 'ok', 'period']);
  assert.deepEqual(s.period, { startDate: '2026-10-31', endDate: '2026-11-06' });
  assert.ok(!out[0].includes(SECRET) && !out[0].includes('999') && !out[0].includes('opencardai.com'));
  assert.equal(seen.tokenMode, 0o600);
  assert.deepEqual(seen.args, ['--import', 'tsx', 'scripts/gsc-daily.ts']);
  assert.ok(!('GSC_TOKEN_JSON' in seen.env) && !('GITHUB_TOKEN' in seen.env));
  assert.ok(!fs.existsSync(seen.dir));
});

test('alerts exit 1 still ok; failure / missing history fails closed and cleans temp', () => {
  const out = [], seen = {};
  assert.equal(runAcceptance({ env: env(), print: (s) => out.push(s), spawn: fakeSpawn((d) => hist(d, { period: { startDate: '2026-10-31', endDate: '2026-11-06' } }), 1) }), 0);
  assert.equal(runAcceptance({ env: env(), print: (s) => out.push(s), spawn: fakeSpawn(null, 1, seen) }), 1);
  assert.equal(JSON.parse(out.at(-1)).ok, false);
  assert.ok(!fs.existsSync(seen.dir));
});

test('thrown spawn error does not leak and temp is removed', () => {
  const out = []; let dir;
  assert.throws(() => runAcceptance({ env: env(), print: (s) => out.push(s), spawn: (_b, _a, o) => { dir = o.env.OPENCARD_GSC_STATE_DIR; throw new Error('boom'); } }));
  assert.ok(!fs.existsSync(dir)); assert.equal(out.length, 0);
});

test('missing/invalid inputs exit 2 without echoing values', () => {
  for (const e of [env({ GSC_CLIENT_SECRET: '' }), env({ GSC_TOKEN_JSON: 'not-json ' + SECRET }), env({ GSC_TOKEN_JSON: '{}' })]) {
    const out = [];
    assert.equal(runAcceptance({ env: e, print: (s) => out.push(s), spawn: () => assert.fail('must not spawn') }), 2);
    assert.ok(!out.join('').includes(SECRET));
  }
});

test('metric-like or odd keys are never echoed', () => {
  const out = [];
  runAcceptance({ env: env(), print: (s) => out.push(s), spawn: fakeSpawn((d) => hist(d, { period: { startDate: 'x' + SECRET, endDate: '2026-11-06' }, ['k ' + SECRET]: 1 })) });
  assert.ok(!out.join('').includes(SECRET));
});

test('workflow contract: manual-only, ops job has no artifacts, secrets only in final step', () => {
  const y = fs.readFileSync(new URL('../../.github/workflows/news-isolated-dry-run.yml', import.meta.url), 'utf8');
  assert.ok(!/^\s*schedule:/m.test(y) && !/pull_request|push:/.test(y));
  const job = y.slice(y.indexOf('  ops-gsc-readonly:'));
  assert.ok(!job.includes('upload-artifact'));
  assert.match(job, /environment: ops-readonly-acceptance/);
  assert.match(job, /contents: read/);
  const firstSecret = job.indexOf('secrets.');
  assert.ok(firstSecret > job.indexOf('npm ci') && firstSecret > job.indexOf('Offline preflight'));
  assert.equal((job.match(/secrets\./g) || []).length, 4);
  assert.match(job, /persist-credentials: false/);
  assert.match(y, /ops_gsc_readonly:[\s\S]*?default: false/);
});
