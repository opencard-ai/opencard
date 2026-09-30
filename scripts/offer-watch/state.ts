/** Persistent offer-watch state: dedup ledger (ledger.json) and append-only event history (history.jsonl). Both gitignored. */
import fs from 'node:fs';
import path from 'node:path';
import { emptyLedger, type Ledger, type LedgerEntry } from './gate';

export const DEFAULT_LEDGER = 'artifacts/offer-watch/ledger.json';
export const DEFAULT_HISTORY = 'artifacts/offer-watch/history.jsonl';

export type EventType = 'applied' | 'held' | 'expiry_review' | 'published' | 'rolled_back' | 'checks_failed' | 'push_failed' | 'deploy_failed' | 'live_check_failed' | 'schema_failed';
export interface HistoryEvent { ts: string; type: EventType; card_id: string | null; changes?: Array<{ field: string; old_value: unknown; new_value: unknown }>; reasons?: string[]; sources?: string[]; commit?: string | null; revert_commits?: string[]; note?: string }

export function loadLedger(file = DEFAULT_LEDGER): Ledger {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : emptyLedger();
}
export function saveLedger(ledger: Ledger, file = DEFAULT_LEDGER) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}
export interface LedgerUpdate { key: string; card_id: string; field: string | null; value: unknown; status: string; reasons?: string[]; commit?: string | null; published_at?: string | null; failure?: string | null }
/** Pure: upsert entries keyed by change fingerprint, keeping first_seen / last_notified. */
export function upsertLedger(ledger: Ledger, updates: LedgerUpdate[], nowIso: string): Ledger {
  const next: Ledger = { version: 1, updated_at: nowIso, entries: { ...ledger.entries } };
  for (const u of updates) {
    const prev = next.entries[u.key];
    const entry: LedgerEntry = {
      card_id: u.card_id, field: u.field, value: u.value, audience: prev?.audience ?? 'public', status: u.status,
      first_seen: prev?.first_seen ?? nowIso, last_seen: nowIso, last_notified: prev?.last_notified ?? null,
      reasons: u.reasons ?? prev?.reasons, commit: u.commit ?? prev?.commit ?? null,
      published_at: u.published_at ?? prev?.published_at ?? null, failure: u.failure ?? (u.status === 'published' ? null : prev?.failure ?? null),
    };
    next.entries[u.key] = entry;
  }
  return next;
}
export function appendHistory(events: HistoryEvent[], file = DEFAULT_HISTORY) {
  if (!events.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, events.map(e => JSON.stringify(e)).join('\n') + '\n');
}
export function readHistory(file = DEFAULT_HISTORY): HistoryEvent[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}
export const laToday = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
