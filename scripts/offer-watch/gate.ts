import { createHash } from 'node:crypto';

export type CardRecord = Record<string, any>;
export interface Candidate {
  card_id: string;
  fields: Record<string, unknown>;
  evidence: { url: string; checked_at: string; official: boolean; audience: string; conflicts?: boolean };
}
const fields = new Set(['annual_fee', 'annual_fee_description', ...['bonus_points', 'statement_credit', 'travel_credit', 'spending_requirement', 'time_period_months', 'free_nights', 'free_night_value_cap', 'expires_at', 'offer_status'].map(key => `welcome_offer.${key}`)]);
const at = (record: CardRecord, key: string) => key.split('.').reduce((value, part) => value?.[part], record);
export function assessCandidate(candidate: Candidate, card: CardRecord | undefined, covered: boolean, now = Date.now()) {
  const evidence = candidate.evidence;
  const changes = Object.entries(candidate.fields || {}).filter(([key, value]) => fields.has(key) && JSON.stringify(at(card || {}, key)) !== JSON.stringify(value))
    .map(([field, new_value]) => ({ field, old_value: at(card || {}, field) ?? null, new_value }));
  const unknownFields = Object.keys(candidate.fields || {}).filter(key => !fields.has(key));
  const checked = Date.parse(evidence?.checked_at);
  let validUrl = false;
  try { const url = new URL(evidence?.url); validUrl = url.protocol === 'https:' && !url.username && !url.password; } catch {}
  const fresh = Number.isFinite(checked) && checked <= now && now - checked <= 7 * 86400000;
  const verified = validUrl && fresh && evidence.official === true && !evidence.conflicts && evidence.audience === 'public' && unknownFields.length === 0;
  const status = !verified ? 'needs_verification' : !card ? 'new_product_review' : changes.length ? 'review_delta' : 'unchanged';
  // Evidence check time is excluded so daily rechecks don't re-notify the same change.
  const fingerprint = createHash('sha256').update(JSON.stringify({ card_id: candidate.card_id, status, covered, changes: [...changes].sort((a,b) => a.field.localeCompare(b.field)), audience: evidence?.audience, url: evidence?.url, unknownFields: [...unknownFields].sort() })).digest('hex');
  return { card_id: candidate.card_id, status, adaptor_covered: covered, coverage_action: covered ? 'none' : verified ? 'review_missing_config' : 'verify_before_config', changes, unknownFields, evidence, fingerprint };
}
