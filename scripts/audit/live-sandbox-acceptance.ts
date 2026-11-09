#!/usr/bin/env node
/** Manual-only live audit-state acceptance against the existing free test DB.
 * Hard cap TOTAL_BUDGET live HTTP calls (every SDK EVAL / fetch). No auth probe beyond those.
 * Namespace opencard:audit-state:{sandbox-audit-<id>}: only. Production/offer refused.
 * Values are synthetic. Allowlisted summary only. NOT a production cutover; NOT full DR proof.
 * Live coverage: lease + CAS write/read path (BASELINE_CREATED + REPORT).
 * AES backup/restore + tamper/wrong-ns/stale/pending: LOCAL only (offline tests), not live HTTP. */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { sandboxAuditStoreFromEnv, validateAuditRedisUrl } from './upstash-audit-transport';
import { AUDIT_DOC, AUDIT_KIND, runWithDurableBaseline, digestOf } from './durable-baseline';
import { BACKUP_KIND, openBackup } from './state-backup';

export const TEST_DATABASE_ID = '74ef02fa-e0fd-4f53-867d-36d4bb4f498f';
export const TEST_ENDPOINT_SHA256 = '04f761ca28daef5b3ad27673aec87736b3651032a553f91f13ec0471b1727c54';
export const TOTAL_BUDGET = 10;
const opts = { docName: AUDIT_DOC };
const finding = (id) => ({ card_id: id, type: 'broken_source_url', severity: 'high', detail: `synthetic-${id}` });

export function pinAndBudget({ url, token, databaseId, budget = TOTAL_BUDGET }) {
  if (databaseId !== TEST_DATABASE_ID) throw new Error('wrong database id');
  validateAuditRedisUrl(url);
  if (createHash('sha256').update(String(url)).digest('hex') !== TEST_ENDPOINT_SHA256) throw new Error('endpoint pin mismatch');
  if (typeof token !== 'string' || token.length < 8 || /\s/.test(token)) throw new Error('invalid token');
  if (!Number.isInteger(budget) || budget < 1 || budget > TOTAL_BUDGET) throw new Error('budget');
  let used = 0;
  return {
    used: () => used,
    tick(label) { if (used >= budget) throw new Error(`http budget exhausted before ${label}`); used += 1; return used; },
  };
}
export function installBudgetFetch(budget, fetchImpl = globalThis.fetch) {
  return async (input, init) => { budget.tick('fetch'); return fetchImpl(input, init); };
}

/** Local AES round-trip of a synthetic Versioned baseline (no network). */
export function localAesRoundtrip(prefix, findings, date = '2026-11-08') {
  const key = randomBytes(32);
  const doc = { schema: 1, version: 2, fence: 2, value: { kind: AUDIT_KIND, date, findings, digest: digestOf(findings), reportedFor: date } };
  const snap = { kind: BACKUP_KIND, prefix, createdAt: '2026-11-09T00:00:00.000Z', doc };
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(`${BACKUP_KIND}|${prefix}`));
  const ct = Buffer.concat([c.update(JSON.stringify(snap)), c.final()]);
  const env = { v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
  const opened = openBackup(env, key, prefix);
  if (opened.doc.value.digest !== digestOf(findings) || opened.doc.value.date !== date) throw new Error('aes');
  // Tamper / wrong-ns refused locally
  const bad = { ...env, ct: Buffer.from(Buffer.from(env.ct, 'base64').map((x, i) => (i === 2 ? x ^ 1 : x))).toString('base64') };
  try { openBackup(bad, key, prefix); throw new Error('tamper-accepted'); } catch (e) { if (!/corrupt|foreign/.test(e.message)) throw e; }
  try { openBackup(env, key, prefix.replace('audit-', 'other-')); throw new Error('wrongns-accepted'); } catch (e) { if (!/corrupt|foreign/.test(e.message)) throw e; }
  return true;
}

export async function runLiveAcceptance({ env = process.env, fetchImpl = globalThis.fetch, print = (s) => console.log(s) } = {}) {
  const out = { ok: false, exit: 1, databaseId: TEST_DATABASE_ID, httpCalls: 0, coverage: [], namespace: null };
  const REASONS = new Set(['live-flag','database-id','sandbox-id','construction-network','namespace','baseline','report','budget','aes','pin','token','config','transport','busy','unknown']);
  const emit = (code, reason) => {
    out.exit = code;
    if (reason) out.reason = REASONS.has(reason) ? reason : 'unknown';
    print(JSON.stringify({ exit: out.exit, ok: out.ok, databaseId: out.databaseId, namespace: out.namespace, httpCalls: out.httpCalls, budget: TOTAL_BUDGET, coverage: out.coverage, ...(out.reason ? { reason: out.reason } : {}) }));
    return code;
  };
  let budget, prevFetch;
  try {
    if (env.OPENCARD_AUDIT_LIVE !== '1') return emit(2, 'live-flag');
    if (env.OPENCARD_SANDBOX_DATABASE_ID !== TEST_DATABASE_ID) return emit(2, 'database-id');
    const fresh = env.OPENCARD_AUDIT_SANDBOX_ID;
    if (!fresh || !/^audit-[a-z0-9-]{8,32}$/.test(fresh) || /offer|production/i.test(fresh)) return emit(2, 'sandbox-id');
    budget = pinAndBudget({ url: env.OPENCARD_AUDIT_REDIS_URL, token: env.OPENCARD_AUDIT_REDIS_TOKEN, databaseId: env.OPENCARD_SANDBOX_DATABASE_ID });
    prevFetch = globalThis.fetch;
    globalThis.fetch = installBudgetFetch(budget, fetchImpl);

    const storeEnv = {
      OPENCARD_AUDIT_DURABLE: `sandbox-redis:${fresh}`,
      OPENCARD_AUDIT_REDIS_URL: env.OPENCARD_AUDIT_REDIS_URL,
      OPENCARD_AUDIT_REDIS_TOKEN: env.OPENCARD_AUDIT_REDIS_TOKEN,
    };
    // Construction must not touch the network.
    const before = budget.used();
    const probe = sandboxAuditStoreFromEnv(storeEnv, 'probe');
    if (budget.used() !== before) return emit(1, 'construction-network');
    out.namespace = probe.prefix;
    if (probe.prefix !== `opencard:audit-state:{sandbox-${fresh}}:`) return emit(1, 'namespace');

    // Live path budget math (retries:0, no autopipeline): 
    // BASELINE_CREATED = acquire+read+assert+cas+release = 5
    // REPORT           = acquire+read+assert+cas+release = 5
    // Total 10; AES/tamper local; no 10th live call reserved for cleanup (keys intentionally retained in sandbox ns).
    const r1 = await runWithDurableBaseline(sandboxAuditStoreFromEnv(storeEnv, 'a'), '2026-11-01', async () => [], opts);
    if (r1.kind !== 'BASELINE_CREATED') return emit(1, 'baseline');
    out.coverage.push('live-baseline-created');
    out.httpCalls = budget.used();

    const r2 = await runWithDurableBaseline(sandboxAuditStoreFromEnv(storeEnv, 'b'), '2026-11-08', async () => [finding('syn-1')], opts);
    if (r2.kind !== 'REPORT' || !r2.fresh || r2.fresh.length !== 1 || r2.fresh[0].card_id !== 'syn-1') return emit(1, 'report');
    out.coverage.push('live-lease-cas-report');
    out.httpCalls = budget.used();
    if (out.httpCalls > TOTAL_BUDGET) return emit(1, 'budget');

    localAesRoundtrip(probe.prefix, [finding('syn-1')]);
    out.coverage.push('local-aes-roundtrip');
    out.coverage.push('tamper-wrongns=local-only');
    out.ok = true; out.httpCalls = budget.used();
    return emit(0);
  } catch (e) {
    out.httpCalls = budget?.used?.() ?? 0;
    const msg = e instanceof Error ? e.message : '';
    const code = /budget/.test(msg) ? 'budget' : /pin|endpoint/.test(msg) ? 'pin' : /token|invalid audit redis/.test(msg) ? 'token' : /BUSY/.test(msg) ? 'busy' : /uncertain|transport/.test(msg) ? 'transport' : /aes|corrupt|foreign/.test(msg) ? 'aes' : 'unknown';
    return emit(1, code);
  } finally {
    if (prevFetch) globalThis.fetch = prevFetch;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLiveAcceptance().then((c) => { process.exitCode = c; }, () => { console.log(JSON.stringify({ ok: false, exit: 1, error: 'internal' })); process.exitCode = 1; });
}
