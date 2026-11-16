export type Finding = { card_id: string; type: string; severity: 'high' | 'medium' | 'low'; field?: string; detail: string; popular?: boolean };

/** Normalize only detail: preserve dates, URLs and other evidence, but ignore elapsed-day counters.
 * Also accepts the old type|card_id|field|detail key format without changing its identity fields. */
export function normalizeFindingKey(key: string): string {
  let detailStart = 0;
  for (let i = 0; i < 3; i++) detailStart = key.indexOf('|', detailStart) + 1;
  const detail = key.slice(detailStart)
    .replace(/\s*\(\d+ days(?: ago)?\)/g, '')
    .replace(/\s+/g, ' ').trim();
  return key.slice(0, detailStart) + detail;
}

/** Rebuild both current and historical report keys here; no baseline migration is needed.
 * Severity is intentionally omitted: threshold escalations (e.g. stale_last_verified low → medium
 * after 365 days) are not re-notified; the human-readable report still shows current severity. */
export const findingKey = (f: Finding): string => normalizeFindingKey(`${f.type}|${f.card_id}|${f.field || ''}|${f.detail}`);
