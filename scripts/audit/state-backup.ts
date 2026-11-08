/** Synthetic-tested encrypted backup/restore for the audit-only baseline document.
 * AES-256-GCM, prefix+kind bound as AAD. Restore refuses: corrupt/tampered/wrong-key envelopes,
 * a different namespace, stale backups (too old, or not newer than the live doc), and any earlier
 * restore left pending (marker present => manual reconciliation). No key material is ever logged. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_DOC, AUDIT_KIND, NeedsReconciliationError, digestOf, type AuditStore, type BaselineDoc, type Versioned } from './durable-baseline';

export const BACKUP_KIND = 'opencard-audit-backup/v1';
export type Envelope = { v: 1; alg: 'aes-256-gcm'; iv: string; tag: string; ct: string };
type Snapshot = { kind: typeof BACKUP_KIND; prefix: string; createdAt: string; doc: Versioned<BaselineDoc> };
const keyOf = (k: Buffer) => { if (!Buffer.isBuffer(k) || k.length !== 32) throw new Error('backup key must be 32 bytes'); return k; };
const isDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const SEV = new Set(['high', 'medium', 'low']);
const validFinding = (f: any) => !!f && typeof f === 'object' && !Array.isArray(f) && typeof f.card_id === 'string' && f.card_id.length > 0
  && typeof f.type === 'string' && f.type.length > 0 && SEV.has(f.severity) && typeof f.detail === 'string' && (f.field === undefined || typeof f.field === 'string');
function validDoc(doc: Versioned<BaselineDoc> | null | undefined): doc is Versioned<BaselineDoc> {
  const v = doc?.value;
  return !!doc && doc.schema === 1 && Number.isSafeInteger(doc.version) && doc.version >= 1 && Number.isSafeInteger(doc.fence) && doc.fence >= 1
    && !!v && v.kind === AUDIT_KIND && isDate(v.date) && Array.isArray(v.findings) && v.findings.every(validFinding) && v.digest === digestOf(v.findings)
    && (v.reportedFor === undefined || isDate(v.reportedFor));
}
const aad = (prefix: string) => Buffer.from(`${BACKUP_KIND}|${prefix}`);

export async function createBackup(store: AuditStore & { prefix: string }, key: Buffer, now = new Date()): Promise<Envelope> {
  keyOf(key);
  await store.lease.acquire();
  try {
    const doc = await store.read<BaselineDoc>(AUDIT_DOC);
    if (!validDoc(doc)) throw new Error('no valid audit baseline to back up');
    const snap: Snapshot = { kind: BACKUP_KIND, prefix: store.prefix, createdAt: now.toISOString(), doc };
    const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(aad(store.prefix));
    const ct = Buffer.concat([c.update(JSON.stringify(snap)), c.final()]);
    return { v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
  } finally { await store.lease.release(); }
}
export function openBackup(env: Envelope, key: Buffer, expectPrefix: string): Snapshot {
  keyOf(key);
  let snap: Snapshot;
  try {
    if (env?.v !== 1 || env.alg !== 'aes-256-gcm') throw new Error();
    const iv = Buffer.from(env.iv, 'base64'), tag = Buffer.from(env.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const d = createDecipheriv('aes-256-gcm', key, iv); d.setAAD(aad(expectPrefix)); d.setAuthTag(tag);
    snap = JSON.parse(Buffer.concat([d.update(Buffer.from(env.ct, 'base64')), d.final()]).toString('utf8'));
  } catch { throw new Error('corrupt or foreign backup'); }
  if (snap?.kind !== BACKUP_KIND || snap.prefix !== expectPrefix || !isFinite(Date.parse(snap.createdAt)) || !validDoc(snap.doc)) throw new Error('corrupt or foreign backup');
  return snap;
}
/** Restore into an (empty or older) audit store. `workDir` holds the pending marker (outside any repo). */
export async function restoreBackup(store: AuditStore & { prefix: string }, env: Envelope, key: Buffer, { workDir, now = new Date(), maxAgeMs = 14 * 864e5 }: { workDir: string; now?: Date; maxAgeMs?: number }) {
  const snap = openBackup(env, key, store.prefix);
  const age = now.getTime() - Date.parse(snap.createdAt);
  if (!(age >= 0 && age <= maxAgeMs)) throw new Error('stale backup (age)');
  const marker = path.join(workDir, 'audit-restore.pending');
  await store.lease.acquire(); // BUSY/uncertain here => nothing attempted, no marker created
  let clean = false, haveMarker = false;
  try {
    let fd: number;
    try { fd = fs.openSync(marker, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600); }
    catch { throw new NeedsReconciliationError('previous restore pending; reconcile before restoring again'); }
    haveMarker = true;
    fs.writeSync(fd, JSON.stringify({ prefix: store.prefix, backupDate: snap.doc.value.date })); fs.closeSync(fd);
    const cur = await store.read<BaselineDoc>(AUDIT_DOC);
    // Chronology, not version: restore CAS re-numbers versions, so a replayed old backup must never win.
    if (cur && cur.value?.date >= snap.doc.value.date) { clean = true; throw new Error('stale backup (live doc is same date or newer)'); }
    try { await store.cas<BaselineDoc>(AUDIT_DOC, cur ? cur.version : 0, snap.doc.value); }
    catch (e) {
      if (/uncertain/.test(e instanceof Error ? e.message : String(e))) throw new NeedsReconciliationError('restore CAS outcome unknown; marker kept');
      clean = true; throw e;
    }
    clean = true;
    return { restoredDate: snap.doc.value.date, fromVersion: snap.doc.version };
  } finally {
    try { await store.lease.release(); } finally { if (clean && haveMarker) fs.rmSync(marker, { force: true }); }
  }
}
