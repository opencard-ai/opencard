import { EXPIRY_FIELD, TRACKED_FIELDS, cardValue, isCosmeticField, normalizeField } from './gate';

export type PendingClass = 'no_changes' | 'cosmetic_only' | 'substantive';
export interface PendingArtifact { card_id?: string; run_id?: string; created_at?: string; diff?: { changes?: Array<{ path: string; before?: unknown; after?: unknown }> } }

const OFFER_KEYS = [...TRACKED_FIELDS].filter(key => key.startsWith('welcome_offer.'));
/** Substantive, normalized view of one diff change (null when the change is cosmetic-only). */
function substantive(change: { path: string; before?: unknown; after?: unknown }): Record<string, unknown> | null {
  if (change.path === 'welcome_offer') {
    const before = { welcome_offer: change.before as any }, after = { welcome_offer: change.after as any };
    const delta: Record<string, unknown> = {};
    for (const key of OFFER_KEYS) {
      const a = cardValue(before, key), b = cardValue(after, key);
      if (JSON.stringify(a) !== JSON.stringify(b)) delta[key] = b;
    }
    return Object.keys(delta).length ? delta : null;
  }
  if (isCosmeticField(change.path)) return null;
  if (TRACKED_FIELDS.has(change.path) || change.path === EXPIRY_FIELD) {
    const a = normalizeField(change.path, change.before), b = normalizeField(change.path, change.after);
    return JSON.stringify(a) === JSON.stringify(b) ? null : { [change.path]: b };
  }
  // Untracked, non-cosmetic paths (earning_rates, benefits, ...) are kept as-is for human review.
  return JSON.stringify(change.before) === JSON.stringify(change.after) ? null : { [change.path]: change.after };
}

export function classifyPending(artifact: PendingArtifact): { klass: PendingClass; signature: string | null } {
  const changes = artifact.diff?.changes || [];
  if (!changes.length) return { klass: 'no_changes', signature: null };
  const deltas = changes.map(substantive).filter(Boolean) as Record<string, unknown>[];
  if (!deltas.length) return { klass: 'cosmetic_only', signature: null };
  const merged = Object.assign({}, ...deltas);
  const signature = JSON.stringify({ card_id: artifact.card_id, delta: Object.keys(merged).sort().map(key => [key, merged[key]]) });
  return { klass: 'substantive', signature };
}

/** Plan: archive no-change / cosmetic-only artifacts and older duplicates (same card + same substantive delta; newest kept). */
export function planPendingArchive(items: Array<{ file: string; artifact: PendingArtifact }>) {
  const plan: Array<{ file: string; card_id: string | undefined; action: 'archive' | 'keep'; reason: string }> = [];
  const newestBySignature = new Map<string, string>();
  const sorted = [...items].sort((a, b) => String(b.artifact.run_id || b.file).localeCompare(String(a.artifact.run_id || a.file)));
  for (const { file, artifact } of sorted) {
    const { klass, signature } = classifyPending(artifact);
    if (klass !== 'substantive') { plan.push({ file, card_id: artifact.card_id, action: 'archive', reason: klass }); continue; }
    const keeper = newestBySignature.get(signature!);
    if (keeper) plan.push({ file, card_id: artifact.card_id, action: 'archive', reason: `duplicate_of:${keeper}` });
    else { newestBySignature.set(signature!, file); plan.push({ file, card_id: artifact.card_id, action: 'keep', reason: 'substantive' }); }
  }
  return plan.sort((a, b) => a.file.localeCompare(b.file));
}
