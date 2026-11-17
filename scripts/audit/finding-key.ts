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
 * after 365 days) notify once as escalated when severity rises, then stay quiet the following week. */
export const findingKey = (f: Finding): string => normalizeFindingKey(`${f.type}|${f.card_id}|${f.field || ''}|${f.detail}`);

export type FindingEscalation = {
  current: Finding; previous: Finding; from: Finding['severity']; to: Finding['severity'];
};
export type FindingChanges = { new: Finding[]; escalated: FindingEscalation[] };
const severityRank: Record<Finding['severity'], number> = { low: 0, medium: 1, high: 2 };

/** Compare each current finding against the highest previous severity for its key.
 * The optional key function lets shadow reports apply their existing URL scrubbing rule. */
export function classifyFindings(previous: Finding[], current: Finding[], key = findingKey): FindingChanges {
  const highest = new Map<string, Finding>();
  for (const f of previous) {
    const k = key(f), prior = highest.get(k);
    if (!prior || severityRank[f.severity] > severityRank[prior.severity]) highest.set(k, f);
  }
  const changes: FindingChanges = { new: [], escalated: [] };
  for (const f of current) {
    const prior = highest.get(key(f));
    if (!prior) changes.new.push(f);
    else if (severityRank[f.severity] > severityRank[prior.severity]) {
      changes.escalated.push({ current: f, previous: prior, from: prior.severity, to: f.severity });
    }
  }
  return changes;
}
