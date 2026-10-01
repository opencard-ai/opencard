import { createHash } from 'node:crypto';

export type CardRecord = Record<string, any>;
/** One independent fetch of an official page, recorded by collect.ts. */
export interface Confirmation { url: string; fetch_id: string; checked_at: string; ok: boolean; status?: number; error?: string; official_domain: boolean; values: Record<string, unknown>; ambiguous_fields?: string[]; content_sha256?: string; final_url?: string; observed?: { current_bonus_visible?: boolean } }
export interface Evidence { url: string; checked_at: string; official: boolean; audience: string; conflicts?: boolean; confirmations?: Confirmation[]; explicit_confirmations?: string[]; hold_only?: boolean; hold_reason?: string; auto_added?: string }
export interface Candidate { card_id: string; fields: Record<string, unknown>; evidence: Evidence }
export interface AssessOptions { officialDomains?: string[] }

const wo = (key: string) => `welcome_offer.${key}`;

/** Canonical key for every welcome-offer expiry alias. */
export const EXPIRY_FIELD = wo('expiry');
export const EXPIRY_ALIASES = ['expires', 'expires_at', 'elevated_until', 'expiry_date'] as const;

const NUMERIC_FIELDS = new Set(['annual_fee', ...['bonus_points', 'bonus_value', 'cash_bonus', 'statement_credit', 'travel_credit',
  'spending_requirement', 'time_period_months', 'free_nights', 'free_night_value_cap', 'normal_bonus_points'].map(wo)]);
const BOOLEAN_FIELDS = new Set([wo('is_elevated')]);
/** Fields whose change is a real offer/product delta. */
export const TRACKED_FIELDS = new Set([...NUMERIC_FIELDS, ...BOOLEAN_FIELDS, 'annual_fee_description', wo('offer_status'), EXPIRY_FIELD]);
/** Bookkeeping fields: never a delta, never "unknown". */
const COSMETIC_LEAVES = new Set(['last_verified', 'last_updated', 'notes', 'confidence', 'next_review', 'source_conflicts']);

const FIELD_ALIASES: Record<string, string> = {
  ...Object.fromEntries(EXPIRY_ALIASES.map(alias => [wo(alias), EXPIRY_FIELD])),
  [wo('spend_requirement')]: wo('spending_requirement'),
  [wo('spend_window_months')]: wo('time_period_months'),
  [wo('time_period')]: wo('time_period_months'),
};

export function canonicalField(key: string): string { return FIELD_ALIASES[key] ?? key; }
export function isCosmeticField(key: string): boolean { return COSMETIC_LEAVES.has(key.split('.').pop() || ''); }

/** "$1,000" / "100,000" / "100k" / 1000 -> number; anything unparseable is kept as trimmed text. */
export function normalizeNumber(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return value;
  const compact = value.trim().toLowerCase().replace(/[$,\s]/g, '').replace(/usd$/, '');
  const match = compact.match(/^(-?\d+(?:\.\d+)?)(k)?$/);
  return match ? Number(match[1]) * (match[2] ? 1000 : 1) : value.trim();
}

export function normalizeBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', '1'].includes(text)) return true;
  if (['false', 'no', '0'].includes(text)) return false;
  return text;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** ISO timestamp, YYYY-MM-DD, M/D/YY(YY) or 'November 4, 2026' -> YYYY-MM-DD (date part only; no timezone shifting). */
export function normalizeDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) return `${us[3].length === 2 ? `20${us[3]}` : us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const named = text.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (named) return `${named[3]}-${String(MONTHS.indexOf(named[1].toLowerCase()) + 1).padStart(2, '0')}-${named[2].padStart(2, '0')}`;
  return text;
}

export function normalizeField(field: string, value: unknown): unknown {
  const key = canonicalField(field);
  if (NUMERIC_FIELDS.has(key)) return normalizeNumber(value);
  if (BOOLEAN_FIELDS.has(key)) return normalizeBoolean(value);
  if (key === EXPIRY_FIELD) return normalizeDate(value);
  if (value === undefined || value === '') return null;
  if (typeof value === 'string') return key === wo('offer_status') ? value.trim().toLowerCase() : value.trim().replace(/\s+/g, ' ');
  return value;
}

export interface NormalizedExpiry { value: string | null; sources: Record<string, string>; conflict: boolean }
/** Collapse expires / expires_at / elevated_until / expiry_date into one date; earliest wins when they disagree. */
export function normalizeExpiry(offer: Record<string, any> | undefined | null): NormalizedExpiry {
  const sources: Record<string, string> = {};
  for (const alias of EXPIRY_ALIASES) {
    const date = normalizeDate(offer?.[alias]);
    if (date) sources[alias] = date;
  }
  const unique = [...new Set(Object.values(sources))].sort();
  return { value: unique[0] ?? null, sources, conflict: unique.length > 1 };
}

const at = (record: CardRecord, key: string) => key.split('.').reduce((value: any, part) => value?.[part], record);
export function cardValue(card: CardRecord | undefined, field: string): unknown {
  const key = canonicalField(field);
  if (key === EXPIRY_FIELD) return normalizeExpiry(card?.welcome_offer).value;
  return normalizeField(key, at(card || {}, key));
}

export const DEFAULT_OFFICIAL_DOMAINS = [
  'americanexpress.com', 'chase.com', 'citi.com', 'aa.com', 'capitalone.com', 'usbank.com', 'bankofamerica.com',
  'barclaycardus.com', 'barclays.com', 'barclaycard.com', 'wellsfargo.com', 'bilt.com', 'biltrewards.com', 'discover.com',
  'marriott.com', 'hilton.com', 'hyatt.com', 'ihg.com', 'delta.com', 'united.com', 'southwest.com', 'alaskaair.com',
  'jetblue.com', 'aircanada.com', 'morganstanley.com',
];

/** Exact host or subdomain match; `*` in an entry matches letters/digits/hyphens within one label (e.g. "barclays*.com"). */
export function isOfficialUrl(url: string, domains: string[] = DEFAULT_OFFICIAL_DOMAINS): boolean {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch { return false; }
  return domains.some(raw => {
    const domain = raw.trim().toLowerCase();
    if (!domain) return false;
    if (!domain.includes('*')) return host === domain || host.endsWith(`.${domain}`);
    const pattern = domain.split('.').map(label => label.split('*').map(part => part.replace(/[^a-z0-9-]/g, '')).join('[a-z0-9-]*')).join('\\.');
    return new RegExp(`^(?:[a-z0-9-]+\\.)*${pattern}$`).test(host);
  });
}

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Dedup key for one field change: evidence URL and check time are deliberately excluded. */
export function changeFingerprint(cardId: string, field: string, value: unknown, audience: string | undefined): string {
  return sha({ card_id: cardId, field: canonicalField(field), value: normalizeField(field, value), audience: audience ?? null });
}

export function assessCandidate(candidate: Candidate, card: CardRecord | undefined, covered: boolean, now = Date.now(), options: AssessOptions = {}) {
  const evidence = candidate.evidence;
  const reasons: string[] = [];
  const proposed = new Map<string, unknown>();
  const unknownFields: string[] = [];
  const ignoredFields: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(candidate.fields || {})) {
    const key = canonicalField(rawKey);
    if (!TRACKED_FIELDS.has(key)) { (isCosmeticField(rawKey) ? ignoredFields : unknownFields).push(rawKey); continue; }
    const value = normalizeField(key, rawValue);
    if (proposed.has(key) && JSON.stringify(proposed.get(key)) !== JSON.stringify(value)) reasons.push(`conflicting_alias_values:${key}`);
    if (!proposed.has(key) || (key === EXPIRY_FIELD && String(value) < String(proposed.get(key)))) proposed.set(key, value);
  }
  const changes = [...proposed].filter(([field, value]) => JSON.stringify(cardValue(card, field)) !== JSON.stringify(value))
    .map(([field, new_value]) => ({ field, old_value: cardValue(card, field) ?? null, new_value, fingerprint: changeFingerprint(candidate.card_id, field, new_value, evidence?.audience) }))
    .sort((a, b) => a.field.localeCompare(b.field));

  let validUrl = false;
  try { const url = new URL(evidence?.url); validUrl = url.protocol === 'https:' && !url.username && !url.password; } catch {}
  const officialDomain = validUrl && isOfficialUrl(evidence.url, options.officialDomains);
  const checked = Date.parse(evidence?.checked_at);
  const fresh = Number.isFinite(checked) && checked <= now && now - checked <= 7 * 86400000;
  if (!validUrl) reasons.push('invalid_url');
  if (!fresh) reasons.push('stale_or_invalid_checked_at');
  if (evidence?.official !== true) reasons.push('not_marked_official');
  else if (validUrl && !officialDomain) reasons.push('official_claim_from_non_allowlisted_domain');
  if (evidence?.conflicts) reasons.push('source_conflicts');
  if (evidence?.audience !== 'public') reasons.push('non_public_audience');
  if (unknownFields.length) reasons.push('unknown_fields');
  const verified = reasons.length === 0;
  const status = !verified ? 'needs_verification' : !card ? 'new_product_review' : changes.length ? 'review_delta' : 'unchanged';
  const coverage_action = covered ? 'none' : verified ? 'review_missing_config' : 'verify_before_config';
  // Result key: per-change fingerprints (card+field+value+audience), no URL/check time, so rechecks from other pages don't re-notify.
  const fingerprint = changes.length
    ? sha({ card_id: candidate.card_id, changes: changes.map(c => c.fingerprint).sort() })
    : sha({ card_id: candidate.card_id, status, coverage_action, audience: evidence?.audience ?? null, unknownFields: [...unknownFields].sort() });
  return { card_id: candidate.card_id, status, reasons, official_domain: officialDomain, adaptor_covered: covered, coverage_action, changes, unknownFields, ignoredFields, evidence, fingerprint };
}
export type Assessment = ReturnType<typeof assessCandidate>;

// ---------- persistent dedup ledger ----------
export interface LedgerEntry { card_id: string; field: string | null; value: unknown; audience: string | null; status: string; first_seen: string; last_seen: string; last_notified: string | null; reasons?: string[]; commit?: string | null; published_at?: string | null; failure?: string | null }
export interface Ledger { version: 1; updated_at: string | null; entries: Record<string, LedgerEntry> }
export const emptyLedger = (): Ledger => ({ version: 1, updated_at: null, entries: {} });

export const isActionable = (result: Assessment) => result.status !== 'unchanged' || result.coverage_action !== 'none';
function ledgerKeys(result: Assessment) {
  return result.changes.length
    ? result.changes.map(c => ({ key: c.fingerprint, field: c.field as string | null, value: c.new_value }))
    : [{ key: result.fingerprint, field: null, value: null }];
}
/** Notify only for actionable results with at least one key never notified, or whose status changed since last notice. */
export function shouldNotify(result: Assessment, ledger: Ledger): boolean {
  if (!isActionable(result)) return false;
  return ledgerKeys(result).some(({ key }) => { const entry = ledger.entries[key]; return !entry || !entry.last_notified || entry.status !== result.status; });
}
/** Verified statuses outrank needs_verification when the same change arrives from several sources in one batch. */
const STATUS_RANK: Record<string, number> = { needs_verification: 0, unchanged: 0, review_delta: 2, new_product_review: 2 };
const rank = (status: string) => STATUS_RANK[status] ?? 1;
/** Within one batch, only the best-ranked result per fingerprint may notify; the rest are marked duplicates. */
export function dedupeBatch<T extends Assessment & { notify: boolean }>(results: T[]): Array<T & { batch_duplicate_of: number | null }> {
  const best = new Map<string, number>();
  results.forEach((result, index) => {
    const current = best.get(result.fingerprint);
    if (current === undefined || rank(result.status) > rank(results[current].status)) best.set(result.fingerprint, index);
  });
  return results.map((result, index) => {
    const keeper = best.get(result.fingerprint)!;
    return keeper === index ? { ...result, batch_duplicate_of: null } : { ...result, notify: false, batch_duplicate_of: keeper };
  });
}
/** Pure: returns an updated copy. Only actionable results are recorded; the best-ranked status in a batch wins. */
export function updateLedger(ledger: Ledger, results: Array<Assessment & { notify: boolean }>, nowIso: string): Ledger {
  const next: Ledger = { version: 1, updated_at: nowIso, entries: { ...ledger.entries } };
  for (const result of [...results].sort((a, b) => rank(a.status) - rank(b.status))) {
    if (!isActionable(result)) continue;
    for (const { key, field, value } of ledgerKeys(result)) {
      const previous = next.entries[key];
      next.entries[key] = {
        ...previous,
        card_id: result.card_id, field, value, audience: result.evidence?.audience ?? null, status: result.status,
        first_seen: previous?.first_seen ?? nowIso, last_seen: nowIso,
        last_notified: result.notify || previous?.last_notified === nowIso ? nowIso : previous?.last_notified ?? null,
      };
    }
  }
  return next;
}

// ---------- deterministic expiry check ----------
export interface ExpiryItem { card_id: string; expiry: string; days_left: number; expiry_sources: Record<string, string>; alias_conflict: boolean; is_elevated: boolean; offer_status: string | null; limited_time: boolean; priority: 'high' | 'normal' | 'low'; reason: string }
const dayNumber = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export function isLimitedTime(offer: Record<string, any> | undefined): boolean {
  return /limited/i.test(String(offer?.offer_status ?? '')) || /limited/i.test(String(offer?.offer_type ?? '')) || /^\s*limited[- ]time/i.test(String(offer?.description ?? ''));
}
export function expiryReport(cards: Iterable<CardRecord>, today: string, windows = { warnDays: 14, focusDays: 30 }) {
  const expired: ExpiryItem[] = [], expiringSoon: ExpiryItem[] = [], focus: ExpiryItem[] = [], aliasConflicts: ExpiryItem[] = [];
  const todayNumber = dayNumber(today);
  for (const card of cards) {
    const offer = card?.welcome_offer;
    const expiry = normalizeExpiry(offer);
    if (!expiry.value || !/^\d{4}-\d{2}-\d{2}$/.test(expiry.value)) continue;
    const days_left = dayNumber(expiry.value) - todayNumber;
    const is_elevated = offer?.is_elevated === true;
    const limited_time = isLimitedTime(offer);
    const offer_status = offer?.offer_status ?? null;
    const alreadyHandled = /expired/i.test(String(offer_status ?? '')) && !is_elevated;
    const priority = alreadyHandled ? 'low' : (is_elevated || limited_time) ? 'high' : 'normal';
    const base = { card_id: card.card_id, expiry: expiry.value, days_left, expiry_sources: expiry.sources, alias_conflict: expiry.conflict, is_elevated, offer_status, limited_time };
    if (days_left < 0) expired.push({ ...base, priority, reason: alreadyHandled ? 'expired; already marked expired/non-elevated' : 'expired but still presented as current/elevated' });
    else if (days_left <= windows.warnDays) expiringSoon.push({ ...base, priority, reason: `expires within ${windows.warnDays} days` });
    else if (days_left <= windows.focusDays) focus.push({ ...base, priority: 'normal', reason: `focus candidate: expires within ${windows.focusDays} days` });
    if (expiry.conflict) aliasConflicts.push({ ...base, priority: 'normal', reason: 'expiry aliases disagree; earliest date used' });
  }
  const byDate = (a: ExpiryItem, b: ExpiryItem) => a.days_left - b.days_left || a.card_id.localeCompare(b.card_id);
  [expired, expiringSoon, focus, aliasConflicts].forEach(list => list.sort(byDate));
  return {
    today, windows: { warn_days: windows.warnDays, focus_days: windows.focusDays },
    summary: { expired: expired.length, expired_high_priority: expired.filter(i => i.priority === 'high').length, expiring_within_warn: expiringSoon.length, focus_candidates: focus.length, alias_conflicts: aliasConflicts.length },
    expired, expiring_soon: expiringSoon, focus, alias_conflicts: aliasConflicts,
  };
}
