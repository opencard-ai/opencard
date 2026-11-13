#!/usr/bin/env node
// Hosted GSC read-only acceptance runner. Runs scripts/gsc-daily.ts against https://opencardai.com
// (gsc-daily.ts only issues Search Analytics read calls; the stored token is expected to carry webmasters.readonly) with state + token in a private temp dir.
// Starts with NO real history/baseline (gsc-daily creates a fresh baseline in temp). Prints ONLY an
// allowlisted JSON summary: exit code, report window, key names. Raw stdout/stderr are discarded.
// Inputs (env): GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REDIRECT_URI (optional), GSC_TOKEN_JSON.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const KEY_RE = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
export function summarize(dir, rc) {
  const out = { exit: rc, ok: false, entries: 0, period: null, keys: [], baselineCreated: fs.existsSync(path.join(dir, '.gsc-cohort-baseline.json')) };
  const h = path.join(dir, '.gsc-report-history.json');
  if (!fs.existsSync(h)) return out;
  const hist = JSON.parse(fs.readFileSync(h, 'utf8'));
  const last = Array.isArray(hist) ? hist[hist.length - 1] : null;
  if (!last || typeof last !== 'object') return out;
  const d = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  out.entries = hist.length;
  out.period = last.period ? { startDate: d(last.period.startDate), endDate: d(last.period.endDate) } : null;
  out.keys = Object.keys(last).filter((k) => KEY_RE.test(k)).sort();
  out.ok = (rc === 0 || rc === 1) && !!out.period?.startDate; // gsc-daily exits 1 when it raises alerts
  return out;
}

export function runAcceptance({ env = process.env, spawn = spawnSync, cwd = process.cwd(), print = (s) => process.stdout.write(s + '\n') } = {}) {
  for (const n of ['GSC_CLIENT_ID', 'GSC_CLIENT_SECRET', 'GSC_TOKEN_JSON']) if (!env[n]) { print(JSON.stringify({ exit: 2, ok: false, error: `missing ${n}` })); return 2; }
  let token;
  try { token = JSON.parse(env.GSC_TOKEN_JSON); } catch { print(JSON.stringify({ exit: 2, ok: false, error: 'GSC_TOKEN_JSON not JSON' })); return 2; }
  if (!token || typeof token !== 'object' || !token.refresh_token) { print(JSON.stringify({ exit: 2, ok: false, error: 'token missing refresh_token' })); return 2; }
  const dir = fs.mkdtempSync(path.join(env.RUNNER_TEMP || os.tmpdir(), 'gsc-acc-'));
  fs.chmodSync(dir, 0o700);
  try {
    const tokenPath = path.join(dir, 'token.json');
    fs.writeFileSync(tokenPath, JSON.stringify(token), { mode: 0o600, flag: 'wx' });
    const childEnv = { PATH: env.PATH, HOME: env.HOME, NODE_NO_WARNINGS: '1', GSC_CLIENT_ID: env.GSC_CLIENT_ID, GSC_CLIENT_SECRET: env.GSC_CLIENT_SECRET, ...(env.GSC_REDIRECT_URI ? { GSC_REDIRECT_URI: env.GSC_REDIRECT_URI } : {}), OPENCARD_GSC_STATE_DIR: dir, OPENCARD_GSC_TOKEN_PATH: tokenPath };
    const r = spawn(process.execPath, ['--import', 'tsx', 'scripts/gsc-daily.ts'], { cwd, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
    const rc = typeof r.status === 'number' ? r.status : 124;
    let s;
    try { s = summarize(dir, rc); } catch { s = { exit: rc, ok: false, error: 'history unreadable' }; }
    print(JSON.stringify(s));
    return s.ok ? 0 : 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = runAcceptance();
void pathToFileURL;
