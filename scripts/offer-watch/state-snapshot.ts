/** Offline encrypted sandbox-fixture snapshot. Never loads env, Mac state, Redis, or credentials. */
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Ledger, CardRecord } from './gate';
import type { HistoryEvent } from './state';
import type { AppliedCard } from './publish-core';
import type { OfferJournal } from './publish-journal';
const MAX = 2 * 1024 * 1024;
export interface OperationalState { schema: 1; ledger: Ledger; history: HistoryEvent[]; daily: { updated?: string; fetch_failures?: Record<string, string[]>; runs?: Record<string, { runId: string; phase: string; applied: AppliedCard[]; cardsBefore?: Record<string, CardRecord>; cardsAfter?: Record<string, CardRecord> }> } }
export interface SandboxBundle extends OperationalState { fixtureOnly: true; fixtureId: string; journals: OfferJournal[]; claims: Record<string, string> }
const digest = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 10000;
const list = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 500 && v.every(text);
function fail(): never { throw new Error('snapshot schema/format/size invalid; no values printed'); }
function keys(v: Record<string, unknown>, allowed: string[]) { if (Object.keys(v).some(k => !allowed.includes(k))) fail(); }
function safeJson(raw: string, max = MAX): unknown {
  if (Buffer.byteLength(raw) > max) fail();
  let count = 0;
  const walk = (v: unknown, depth: number) => {
    if (++count > 100000 || depth > 32) fail();
    if (typeof v === 'string' && v.length > max) fail();
    if (object(v)) for (const [key, value] of Object.entries(v)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) fail(); walk(value, depth + 1); }
    if (Array.isArray(v)) v.forEach(value => walk(value, depth + 1));
  };
  const value = JSON.parse(raw); walk(value, 0); return value;
}
export function validateBundle(value: unknown): SandboxBundle {
  if (!object(value)) fail();
  keys(value, ['schema', 'fixtureOnly', 'fixtureId', 'ledger', 'history', 'daily', 'journals', 'claims']);
  if (value.schema !== 1 || value.fixtureOnly !== true || !text(value.fixtureId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.fixtureId)) fail();
  const ledger = value.ledger;
  if (!object(ledger) || ledger.version !== 1 || !object(ledger.entries) || !(ledger.updated_at === null || text(ledger.updated_at))) fail();
  keys(ledger, ['version', 'updated_at', 'entries']);
  if (Object.keys(ledger.entries).length > 5000) fail();
  for (const entry of Object.values(ledger.entries)) {
    if (!object(entry)) fail();
    keys(entry, ['card_id', 'field', 'value', 'audience', 'status', 'first_seen', 'last_seen', 'last_notified', 'reasons', 'commit', 'published_at', 'failure']);
    if (!text(entry.card_id) || !text(entry.status) || !text(entry.first_seen) || !text(entry.last_seen) || !(entry.field === null || text(entry.field)) || !(entry.audience === null || text(entry.audience)) || !(entry.last_notified === null || text(entry.last_notified)) || !Object.hasOwn(entry, 'value')) fail();
    for (const field of ['commit', 'published_at', 'failure']) if (entry[field] !== undefined && entry[field] !== null && !text(entry[field])) fail();
    if (entry.reasons !== undefined && !list(entry.reasons)) fail();
  }
  if (!Array.isArray(value.history) || value.history.length > 10000) fail();
  const events = ['applied', 'held', 'expiry_review', 'published', 'rolled_back', 'checks_failed', 'push_failed', 'deploy_failed', 'live_check_failed', 'schema_failed'];
  for (const event of value.history) {
    if (!object(event)) fail();
    keys(event, ['ts', 'type', 'card_id', 'changes', 'reasons', 'sources', 'commit', 'revert_commits', 'note']);
    if (!text(event.ts) || !events.includes(String(event.type)) || !(event.card_id === null || text(event.card_id))) fail();
    for (const field of ['reasons', 'sources', 'revert_commits']) if (event[field] !== undefined && !list(event[field])) fail();
    if (event.commit !== undefined && event.commit !== null && !text(event.commit)) fail();
    if (event.note !== undefined && !text(event.note)) fail();
    if (event.changes !== undefined) {
      if (!Array.isArray(event.changes)) fail();
      for (const change of event.changes) { if (!object(change) || !text(change.field) || !Object.hasOwn(change, 'old_value') || !Object.hasOwn(change, 'new_value')) fail(); keys(change, ['field', 'old_value', 'new_value']); }
    }
  }
  if (!object(value.daily)) fail(); keys(value.daily, ['updated', 'fetch_failures', 'runs']);
  if (value.daily.runs !== undefined) {
    if (!object(value.daily.runs) || Object.keys(value.daily.runs).length > 100) fail();
    for (const [id, run] of Object.entries(value.daily.runs)) {
      if (!object(run) || run.runId !== id || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || !text(run.phase) || !Array.isArray(run.applied) || run.applied.length > 100) fail();
      keys(run, ['runId', 'phase', 'applied', 'cardsBefore', 'cardsAfter']);
      for (const field of ['cardsBefore', 'cardsAfter']) if (run[field] !== undefined) { if (!object(run[field])) fail(); for (const [id, card] of Object.entries(run[field])) if (!/^[A-Za-z0-9._-]+$/.test(id) || !object(card) || card.card_id !== id) fail(); }
      for (const card of run.applied) {
        if (!object(card) || !text(card.card_id) || typeof card.file !== 'string' || !/^data\/cards\/[A-Za-z0-9._-]+\.json$/.test(card.file) || !list(card.sources) || !Array.isArray(card.changes)) fail();
        keys(card, ['card_id', 'file', 'sources', 'changes']);
        for (const change of card.changes) { if (!object(change) || !text(change.field) || !text(change.fingerprint) || !Object.hasOwn(change, 'old_value') || !Object.hasOwn(change, 'new_value')) fail(); keys(change, ['field', 'fingerprint', 'old_value', 'new_value']); }
      }
    }
  }
  if (value.daily.updated !== undefined && !text(value.daily.updated)) fail();
  if (value.daily.fetch_failures !== undefined && (!object(value.daily.fetch_failures) || Object.values(value.daily.fetch_failures).some(v => !list(v)))) fail();
  if (!Array.isArray(value.journals) || value.journals.length > 100 || !object(value.claims) || Object.keys(value.claims).length > 200) fail();
  const runIds = new Set<string>();
  for (const journal of value.journals) {
    if (!object(journal) || journal.version !== 1 || !text(journal.runId) || !/^[A-Za-z0-9_-]{1,100}$/.test(journal.runId) || runIds.has(journal.runId) || !text(journal.phase) || !list(journal.files) || !journal.files.length || !journal.files.every(f => /^data\/cards\/[A-Za-z0-9._-]+\.json$/.test(f)) || !list(journal.fingerprints) || !journal.fingerprints.length) fail();
    keys(journal, ['version', 'runId', 'fingerprints', 'files', 'phase', 'pushAttempted', 'headSha', 'prNumber', 'mergeSha', 'rollbackAttempted', 'rollbackHead', 'rollbackPr', 'rollbackSha', 'deployment']);
    runIds.add(journal.runId);
    for (const field of ['headSha', 'mergeSha', 'rollbackHead', 'rollbackSha']) if (journal[field] !== undefined && (typeof journal[field] !== 'string' || !/^[0-9a-f]{40}$/.test(journal[field]))) fail();
    for (const field of ['prNumber', 'rollbackPr']) if (journal[field] !== undefined && (!Number.isSafeInteger(journal[field]) || Number(journal[field]) < 1)) fail();
    if (journal.pushAttempted !== undefined && typeof journal.pushAttempted !== 'boolean') fail();
    if (journal.rollbackAttempted !== undefined && typeof journal.rollbackAttempted !== 'boolean') fail();
    if (journal.deployment !== undefined && !text(journal.deployment)) fail();
    for (const fp of journal.fingerprints) if (journal.headSha && journal.pushAttempted !== false && value.claims[fp] !== journal.runId) fail();
  }
  for (const [fp, owner] of Object.entries(value.claims)) if (!fp || !text(owner) || !/^[A-Za-z0-9_-]{1,100}$/.test(owner)) fail();
  // Round-trip bounds and dangerous JSON keys also apply to in-memory callers.
  safeJson(JSON.stringify(value));
  return value as unknown as SandboxBundle;
}
export function readSandboxFixtures(root: string): SandboxBundle {
  if (!path.isAbsolute(root)) throw new Error('explicit absolute sandbox-fixture directory required');
  const read = (name: string, optional = false) => {
    const file = path.join(root, name);
    if (optional && !fs.existsSync(file)) return undefined;
    const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX / 2) fail();
    return fs.readFileSync(file, 'utf8');
  };
  const marker = safeJson(read('offer-state.sandbox.json')!) as Record<string, unknown>;
  if (!object(marker) || marker.schema !== 1 || marker.sandbox !== true || !text(marker.fixtureId)) throw new Error('explicit sandbox fixture marker required');
  keys(marker, ['schema', 'sandbox', 'fixtureId']);
  const history = read('history.jsonl')!.split('\n').filter(Boolean).map(line => safeJson(line));
  return validateBundle({ schema: 1, fixtureOnly: true, fixtureId: marker.fixtureId, ledger: safeJson(read('ledger.json')!), history, daily: safeJson(read('daily-state.json')!), journals: safeJson(read('journals.json', true) ?? '[]'), claims: safeJson(read('claims.json', true) ?? '{}') });
}
interface Snapshot { format: 'opencard-offer-snapshot'; schema: 1; fixtureOnly: true; cipher: 'aes-256-gcm'; digest: string; nonce: string; tag: string; ciphertext: string }
const aad = (snapshot: Pick<Snapshot, 'format' | 'schema' | 'fixtureOnly' | 'cipher' | 'digest'>) => Buffer.from(JSON.stringify([snapshot.format, snapshot.schema, snapshot.fixtureOnly, snapshot.cipher, snapshot.digest]));
export function exportSnapshot(input: SandboxBundle, key: Buffer): Buffer {
  if (key.length !== 32) throw new Error('explicit 32-byte encryption key required');
  const body = JSON.stringify(validateBundle(input)), nonce = randomBytes(12);
  const header = { format: 'opencard-offer-snapshot' as const, schema: 1 as const, fixtureOnly: true as const, cipher: 'aes-256-gcm' as const, digest: digest(body) };
  const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(aad(header));
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.from(JSON.stringify({ ...header, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }));
}
export function importSnapshot(encoded: Buffer, key: Buffer): { bundle: SandboxBundle; digest: string } {
  if (key.length !== 32 || encoded.length > 4 * 1024 * 1024) fail();
  try {
    const value = safeJson(encoded.toString('utf8'), 4 * 1024 * 1024);
    if (!object(value)) fail(); keys(value, ['format', 'schema', 'fixtureOnly', 'cipher', 'digest', 'nonce', 'tag', 'ciphertext']);
    if (value.format !== 'opencard-offer-snapshot' || value.schema !== 1 || value.fixtureOnly !== true || value.cipher !== 'aes-256-gcm' || typeof value.digest !== 'string' || !/^[0-9a-f]{64}$/.test(value.digest) || typeof value.nonce !== 'string' || typeof value.tag !== 'string' || typeof value.ciphertext !== 'string') fail();
    const snapshot = value as unknown as Snapshot;
    const nonce = Buffer.from(snapshot.nonce, 'base64'), tag = Buffer.from(snapshot.tag, 'base64');
    if (nonce.length !== 12 || tag.length !== 16) fail();
    const decipher = createDecipheriv('aes-256-gcm', key, nonce); decipher.setAAD(aad(snapshot)); decipher.setAuthTag(tag);
    const raw = Buffer.concat([decipher.update(Buffer.from(snapshot.ciphertext, 'base64')), decipher.final()]);
    if (digest(raw) !== snapshot.digest) fail();
    return { bundle: validateBundle(safeJson(raw.toString('utf8'))), digest: snapshot.digest };
  } catch { throw new Error('snapshot authentication/schema/format failed; no import performed'); }
}
export function snapshotDocuments(bundle: SandboxBundle): Record<string, unknown> {
  const valid = validateBundle(bundle);
  const documents: Record<string, unknown> = { operational: { schema: 1, ledger: valid.ledger, history: valid.history, daily: valid.daily } };
  for (const journal of valid.journals) documents[`journal-${digest(journal.runId)}`] = journal;
  for (const [fp, owner] of Object.entries(valid.claims)) documents[`claim-${digest(fp)}`] = owner;
  return documents;
}
export async function restoreSnapshotToSandbox(state: { importIntoNewNamespace(digest: string, documents: Record<string, unknown>, confirm: boolean): Promise<string> }, encoded: Buffer, key: Buffer, confirm: boolean) {
  const decoded = importSnapshot(encoded, key); // Entire snapshot validates before any adapter call.
  return state.importIntoNewNamespace(decoded.digest, snapshotDocuments(decoded.bundle), confirm);
}
export function writePrivateSnapshot(file: string, encoded: Buffer) {
  if (!path.isAbsolute(file) || (fs.statSync(path.dirname(file)).mode & 0o077) !== 0) throw new Error('explicit private output directory required');
  fs.writeFileSync(file, encoded, { flag: 'wx', mode: 0o600 });
}
