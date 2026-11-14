/** Pure helpers for comparing a cloud dry-run offer-watch day with the Mac run of the same PT date.
 * Inputs are the files offer-watch already writes: candidates-<D>.json (collect) and apply-<D>.json / apply-<D>.dry.json (apply).
 * Read-only: nothing here touches card data, the ledger, git or the network. */

export interface CandidateLike { card_id: string; fields?: Record<string, unknown>; evidence?: { hold_only?: boolean; confirmations?: Array<{ ok?: boolean; url?: string; error?: string; values?: Record<string, unknown> }> } }
export interface PlanLike { applied?: Array<{ card_id: string; changes?: Array<{ field: string; new_value?: unknown }> }>; held?: Array<{ card_id: string; field?: string | null; value?: unknown }>; expiry_review?: Array<{ card_id: string; field?: string | null }> }

export interface CardDiff { card_id: string; status: 'match' | 'values_differ' | 'cloud_only' | 'mac_only' | 'fetch_gap'; cloud_ok: number; cloud_total: number; mac_ok: number; mac_total: number; differing_fields: string[] }
export interface ShadowReport { cards: number; match: number; values_differ: number; fetch_gap: number; cloud_only: number; mac_only: number; diffs: CardDiff[]; plan?: { only_cloud: string[]; only_mac: string[]; both: number } }

const stable = (value: unknown) => JSON.stringify(value ?? null);
/** Absent (not extracted) is distinct from an explicit null (e.g. "no statement credit"). */
const fieldValue = (fields: Record<string, unknown> | undefined, key: string) => (fields && Object.hasOwn(fields, key) ? stable(fields[key]) : '<absent>');
const fetchCounts = (c?: CandidateLike) => { const list = c?.evidence?.confirmations || []; return { ok: list.filter(f => f.ok).length, total: list.length }; };

/** Compare extracted field values per card. A card whose fetches all failed on one side is a fetch_gap, not a value difference. */
export function compareCandidates(cloud: CandidateLike[], mac: CandidateLike[]): ShadowReport {
  const byId = (list: CandidateLike[]) => new Map(list.map(c => [c.card_id, c]));
  const a = byId(cloud), b = byId(mac);
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  const diffs: CardDiff[] = ids.map(card_id => {
    const c = a.get(card_id), m = b.get(card_id);
    const cc = fetchCounts(c), mc = fetchCounts(m);
    const base = { card_id, cloud_ok: cc.ok, cloud_total: cc.total, mac_ok: mc.ok, mac_total: mc.total };
    if (!m) return { ...base, status: 'cloud_only', differing_fields: [] };
    if (!c) return { ...base, status: 'mac_only', differing_fields: [] };
    const fields = [...new Set([...Object.keys(c.fields || {}), ...Object.keys(m.fields || {})])].sort();
    const differing = fields.filter(f => fieldValue(c.fields, f) !== fieldValue(m.fields, f));
    if ((cc.ok === 0) !== (mc.ok === 0)) return { ...base, status: 'fetch_gap', differing_fields: differing };
    return { ...base, status: differing.length ? 'values_differ' : 'match', differing_fields: differing };
  });
  const count = (s: CardDiff['status']) => diffs.filter(d => d.status === s).length;
  return { cards: ids.length, match: count('match'), values_differ: count('values_differ'), fetch_gap: count('fetch_gap'), cloud_only: count('cloud_only'), mac_only: count('mac_only'), diffs };
}

/** Planned (cloud dry-run) vs actual (Mac) apply decisions, keyed by kind|card|field|value. */
export function planKeys(plan: PlanLike | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const p of plan?.applied || []) for (const ch of p.changes || []) keys.add(`applied|${p.card_id}|${ch.field}|${stable(ch.new_value)}`);
  for (const h of plan?.held || []) keys.add(`held|${h.card_id}|${h.field ?? ''}|${stable(h.value)}`);
  for (const e of plan?.expiry_review || []) keys.add(`expiry_review|${e.card_id}|${e.field ?? ''}`);
  return keys;
}
export function comparePlans(cloud: PlanLike | null | undefined, mac: PlanLike | null | undefined) {
  const a = planKeys(cloud), b = planKeys(mac);
  return { only_cloud: [...a].filter(k => !b.has(k)).sort(), only_mac: [...b].filter(k => !a.has(k)).sort(), both: [...a].filter(k => b.has(k)).length };
}

export function renderMarkdown(report: ShadowReport): string {
  const lines = [`| result | count |`, `|---|---|`, ...(['match', 'values_differ', 'fetch_gap', 'cloud_only', 'mac_only'] as const).map(k => `| ${k} | ${report[k]} |`)];
  const notable = report.diffs.filter(d => d.status !== 'match');
  if (notable.length) {
    lines.push('', '| card | status | cloud ok/total | mac ok/total | differing fields |', '|---|---|---|---|---|');
    for (const d of notable) lines.push(`| ${d.card_id} | ${d.status} | ${d.cloud_ok}/${d.cloud_total} | ${d.mac_ok}/${d.mac_total} | ${d.differing_fields.join(', ')} |`);
  }
  if (report.plan) lines.push('', `plan: both ${report.plan.both}, only cloud ${report.plan.only_cloud.length}, only mac ${report.plan.only_mac.length}`, ...report.plan.only_cloud.map(k => `- cloud only: ${k}`), ...report.plan.only_mac.map(k => `- mac only: ${k}`));
  return lines.join('\n');
}
