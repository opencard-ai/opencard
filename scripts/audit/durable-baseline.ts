/** Durable weekly-audit orchestration with versioned baseline and fenced lease.
 * Default document remains `operational` for PR65 compatibility. Independent audit
 * stores use AUDIT_DOC through the optional docName argument. Delivery is always
 * the caller's responsibility. */
import { createHash } from 'node:crypto';

export interface Versioned<T> { schema: 1; version: number; fence: number; value: T }
export interface AuditStore {
  lease: { acquire(): Promise<number>; assert(): Promise<void>; renew(): Promise<void>; release(): Promise<boolean>; fencing(): number | undefined };
  read<T>(name: string): Promise<Versioned<T> | null>;
  cas<T>(name: string, expectedVersion: number, value: T): Promise<Versioned<T>>;
}
export type Finding = { card_id: string; type: string; severity: 'high' | 'medium' | 'low'; field?: string; detail: string };
export interface BaselineDoc { kind: typeof AUDIT_KIND; date: string; findings: Finding[]; digest: string; reportedFor?: string }

const digestOf = (findings: Finding[]) => createHash('sha256').update(JSON.stringify(findings)).digest('hex');
/** PR65 docKey() allowlists only `operational` / `journal-<sha256>`. The audit baseline therefore uses
 *  `operational` inside a DEDICATED audit-only sandbox prefix (separate lease/fence/doc keys), and the value
 *  carries `kind` so an offer operational doc is never accepted as (or overwritten by) an audit baseline. */
export const DOC = 'operational';
export const AUDIT_DOC = 'audit-baseline';
export const AUDIT_KIND = 'opencard-weekly-audit-baseline/v1';
/** Audit-only namespace. PR65's assertSandboxPrefix accepts `opencard:offer-state:{sandbox-<id>}:`; we further
 *  require the id to start with `audit-` so the offer runner's sandbox prefixes can never be reused here. */
export function assertAuditNamespace(prefix: string, offerPrefixes: string[]) {
  if (!Array.isArray(offerPrefixes) || offerPrefixes.length === 0) throw new Error('configured offer prefixes required for collision check');
  if (!/^opencard:offer-state:\{sandbox-audit-[a-z0-9-]{8,58}\}:$/.test(prefix)) throw new Error('audit-only sandbox prefix required (opencard:offer-state:{sandbox-audit-<id>}:)');
  if (offerPrefixes.includes(prefix)) throw new Error('audit namespace collides with an offer namespace');
  return prefix;
}
/** Adapts a PR65 createRedisOfferState() instance (structurally) after checking its namespace. */
export function auditStoreFromOfferState(state: AuditStore & { prefix: string }, offerPrefixes: string[]): AuditStore {
  assertAuditNamespace(state.prefix, offerPrefixes);
  return state;
}
export class NeedsReconciliationError extends Error { readonly needsReconciliation = true; }
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Shared backend for the in-memory fake: one instance = one "Redis". */
export class FakeBackend {
  now = 0; fence = 0; lease: { token: string; expires: number } | null = null; docs = new Map<string, string>();
  failNextCas: false | 'before' | 'after' = false;
}
/** In-memory store with the same LEASE_LOST / CONFLICT / SCHEMA semantics as PR65 scripts. */
export function createFakeAuditStore(b: FakeBackend, runner: string, ttlMs = 60_000): AuditStore {
  let token: string | undefined, fence: number | undefined, lost = false;
  const guard = () => {
    if (!token || lost) throw new Error('lease unavailable/lost');
    if (!b.lease || b.lease.token !== token || b.lease.expires <= b.now || b.fence !== fence) { lost = true; throw new Error('LEASE_LOST'); }
  };
  return {
    lease: {
      async acquire() {
        if (token || lost) throw new Error('new lease session required');
        if (b.lease && b.lease.expires > b.now) throw new Error('BUSY');
        fence = ++b.fence; token = `${runner}:${fence}`; b.lease = { token, expires: b.now + ttlMs }; return fence;
      },
      async assert() { guard(); },
      async renew() { guard(); b.lease!.expires = b.now + ttlMs; },
      async release() { if (lost || !token) return false; try { guard(); } catch { return false; } b.lease = null; lost = true; return true; },
      fencing: () => fence,
    },
    async read<T>(name: string) {
      guard(); const v = b.docs.get(name); if (!v) return null;
      const doc = JSON.parse(v) as Versioned<T>;
      if (doc.schema !== 1 || !Number.isSafeInteger(doc.version) || doc.version < 1 || !Number.isSafeInteger(doc.fence) || doc.fence < 1) throw new Error('unknown/corrupt state schema');
      return doc;
    },
    async cas<T>(name: string, expectedVersion: number, value: T) {
      guard();
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('invalid CAS version');
      const mode = b.failNextCas; b.failNextCas = false;
      // Like PR65: transport uncertainty permanently invalidates this session.
      if (mode === 'before') { lost = true; throw new Error('state transport uncertain; lease unusable; reconcile with a new session'); }
      const old = b.docs.get(name); const parsed = old ? JSON.parse(old) : null;
      if (parsed && parsed.schema !== 1) throw new Error('SCHEMA');
      const version = parsed ? parsed.version : 0;
      if (version !== expectedVersion) throw new Error('CONFLICT');
      const doc: Versioned<T> = { schema: 1, version: version + 1, fence: fence!, value };
      b.docs.set(name, JSON.stringify(doc));
      if (mode === 'after') { lost = true; throw new Error('state transport uncertain; lease unusable; reconcile with a new session'); }
      return doc;
    },
  };
}

function checkBaseline(doc: Versioned<BaselineDoc> | null): BaselineDoc | null {
  if (!doc) return null;
  const v = doc.value;
  if (doc.schema !== 1 || !v || v.kind !== AUDIT_KIND || !isDate(v.date) || !Array.isArray(v.findings) || digestOf(v.findings) !== v.digest) throw new Error('baseline integrity check failed');
  return v;
}

/** One-time import of an existing (non-reconstructible) db-audit report as the baseline. Never overwrites. */
export async function importBaseline(store: AuditStore, report: { date: string; findings: Finding[] }, expectedDigest: string, { docName = DOC }: { docName?: string } = {}) {
  await store.lease.acquire();
  try {
    if (digestOf(report.findings) !== expectedDigest) throw new Error('import digest mismatch');
    checkBaseline({ schema: 1, version: 1, fence: 1, value: { kind: AUDIT_KIND, date: report.date, findings: report.findings, digest: expectedDigest } });
    if (await store.read(docName)) throw new Error('baseline already present; refusing to overwrite');
    try {
      return await store.cas<BaselineDoc>(docName, 0, { kind: AUDIT_KIND, date: report.date, findings: report.findings, digest: expectedDigest });
    } catch (e) {
      if (/uncertain/.test(e instanceof Error ? e.message : String(e))) throw new NeedsReconciliationError('needs reconciliation: baseline import CAS outcome unknown');
      throw e;
    }
  } finally { await store.lease.release(); }
}

/** `REPORT` means: baseline durably recorded, report NOT yet delivered (delivery: 'caller-must-send').
 *  Semantics are at-most-once: if the caller fails to send after this, that week's report is lost.
 *  Storing the baseline is never treated as delivery; there is no exactly-once guarantee. */
export type RunResult = { kind: 'NO_REPLY' | 'REPORT' | 'ALREADY_REPORTED' | 'BASELINE_CREATED'; fresh: Finding[]; previousDate?: string; delivery: 'none' | 'caller-must-send' };
/** Orchestrates: lease -> read+verify baseline -> run audit (injected) -> assert lease -> CAS new baseline. */
export async function runWithDurableBaseline(store: AuditStore, today: string, runAudit: (heartbeat: () => Promise<void>) => Promise<Finding[]>, { docName = DOC }: { docName?: string } = {}): Promise<RunResult> {
  if (!isDate(today)) throw new Error('invalid PT date');
  await store.lease.acquire();
  try {
    const doc = await store.read<BaselineDoc>(docName);
    const prev = checkBaseline(doc);
    if (prev && (prev.reportedFor === today || prev.date >= today)) return { kind: 'ALREADY_REPORTED', fresh: [], delivery: 'none' };
    const cur = await runAudit(() => store.lease.renew());
    await store.lease.assert(); // lost lease => throw, nothing written
    const key = (f: Finding) => `${f.type}|${f.card_id}|${f.field || ''}|${f.detail.replace(/\s+/g, ' ').trim()}`;
    const prevKeys = new Set((prev?.findings || []).map(key));
    const fresh = prev ? cur.filter(f => (f.severity === 'high' || f.severity === 'medium') && !prevKeys.has(key(f))) : [];
    try {
      await store.cas<BaselineDoc>(docName, doc ? doc.version : 0, { kind: AUDIT_KIND, date: today, findings: cur, digest: digestOf(cur), reportedFor: today });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Write may or may not have committed: do NOT deliver, do NOT retry blindly.
      if (/uncertain/.test(msg)) throw new NeedsReconciliationError(`needs reconciliation: baseline CAS outcome unknown for ${today}; report not delivered`);
      throw e;
    }
    if (!prev) return { kind: 'BASELINE_CREATED', fresh: [], delivery: 'none' };
    return fresh.length ? { kind: 'REPORT', fresh, previousDate: prev.date, delivery: 'caller-must-send' } : { kind: 'NO_REPLY', fresh, previousDate: prev.date, delivery: 'none' };
  } finally { await store.lease.release(); }
}
export { digestOf };
