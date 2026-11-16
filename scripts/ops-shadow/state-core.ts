/** Pure helpers for the "shadow with state" workflow (design #94 §5 step 3): load a pinned ops-state snapshot
 * read-only and summarise what a cloud run would report as NEW vs already KNOWN given that state.
 * Nothing here touches the network, git, card data or ops-state. */
import { createHash } from 'node:crypto';
import { classifyFindings, findingKey, type Finding } from '../audit/finding-key';
export { findingKey, type Finding } from '../audit/finding-key';
import { allFetchesFailed, newFetchFailures, newHolds, type ApplyLike } from '../offer-watch/daily-core';
import type { Candidate, Ledger } from '../offer-watch/gate';
import type { HistoryEvent } from '../offer-watch/state';

export const OFFER_STATE_FILES = ['ledger.json', 'history.jsonl', 'daily-state.json'] as const;
export const AUDIT_FILE_RE = /^\d{4}-\d{2}-\d{2}-(db-audit\.json|db-audit\.md|url-check\.json)$/;

export interface ManifestFile { path: string; sha256: string; size: number }
export interface ManifestCheck { ok: boolean; problems: string[]; verified: number }
/** Every file listed in MANIFEST.json must exist with the recorded sha256 and size; listed paths must stay inside
 * offer-watch/ or audit/ (no traversal). Callers copy only listed files. */
export function checkManifest(files: ManifestFile[], read: (rel: string) => Buffer | null): ManifestCheck {
  const problems: string[] = [];
  let verified = 0;
  for (const f of files) {
    if (!/^(offer-watch\/[A-Za-z0-9._-]+|audit\/[A-Za-z0-9._-]+)$/.test(f.path) || ['.', '..'].includes(f.path.split('/')[1])) { problems.push(`bad path in manifest: ${f.path}`); continue; }
    const b = read(f.path);
    if (!b) { problems.push(`missing: ${f.path}`); continue; }
    const sha = createHash('sha256').update(b).digest('hex');
    if (sha !== f.sha256 || b.length !== f.size) { problems.push(`sha256/size mismatch: ${f.path}`); continue; }
    verified++;
  }
  return { ok: problems.length === 0 && verified > 0, problems, verified };
}

export interface OfferStateInput {
  ledgerBefore: Ledger; ledgerAfter: Ledger;
  historyBefore: number; historyAfter: HistoryEvent[];
  plan: ApplyLike | null; candidates: Candidate[];
  fetchFailuresBefore: Record<string, string[]>;
}
export interface OfferStateReport {
  holds: { total: number; new: number; known: number; new_no_publish_mode: number; new_other: number; new_items: Array<{ kind: string; card_id: string; field: string | null; reasons: string[] }> };
  would_apply_recorded_as_hold: number;
  fetch_failures: { now: number; new: number; known: number; new_cards: string[] };
  ledger: { before: number; after: number; added: number; status_changed: number };
  history: { appended: number; by_type: Record<string, number> };
}
export function offerStateReport(i: OfferStateInput): OfferStateReport {
  const total = (i.plan?.held?.length ?? 0) + (i.plan?.expiry_review?.length ?? 0);
  const fresh = newHolds(i.plan, i.ledgerBefore);
  const npm = fresh.filter(h => h.reasons?.includes('no_publish_mode')).length;
  const now = allFetchesFailed(i.candidates);
  const nf = newFetchFailures(now, i.fetchFailuresBefore);
  const b = i.ledgerBefore.entries || {}, a = i.ledgerAfter.entries || {};
  const appended = i.historyAfter.slice(i.historyBefore);
  const by_type: Record<string, number> = {};
  for (const e of appended) by_type[e.type] = (by_type[e.type] || 0) + 1;
  return {
    holds: { total, new: fresh.length, known: total - fresh.length, new_no_publish_mode: npm, new_other: fresh.length - npm,
      new_items: fresh.map(h => ({ kind: h.kind, card_id: h.card_id, field: h.field, reasons: h.reasons })) },
    would_apply_recorded_as_hold: (i.plan?.held || []).filter(h => h.reasons?.includes('no_publish_mode')).length,
    fetch_failures: { now: Object.keys(now).length, new: Object.keys(nf).length, known: Object.keys(now).length - Object.keys(nf).length, new_cards: Object.keys(nf).sort() },
    ledger: { before: Object.keys(b).length, after: Object.keys(a).length, added: Object.keys(a).filter(k => !(k in b)).length,
      status_changed: Object.keys(a).filter(k => k in b && b[k].status !== a[k].status).length },
    history: { appended: appended.length, by_type },
  };
}

/** ops-state seeds have URL query strings/fragments stripped (MANIFEST.json scrubbing rule), so a finding whose detail
 * embeds a URL with a query would look "new" against a scrubbed baseline. This key applies the same scrub. */
export const stripUrlQuery = (s: string) => s.replace(/https?:\/\/[^\s"'<>()[\]\\]+/g, m => {
  const t = m.match(/[.,;:!]+$/)?.[0] || ''; const core = t ? m.slice(0, -t.length) : m; const i = core.search(/[?#]/);
  return i < 0 ? m : core.slice(0, i) + t;
});
export const scrubbedFindingKey = (f: Finding) => findingKey({ ...f, detail: stripUrlQuery(f.detail) });

export interface AuditStateReport {
  baseline: string | null; current: number; previous: number;
  new_high_medium: number; new_high_medium_scrubbed: number; known_high_medium: number; resolved_high_medium: number;
  escalated_high_medium: number; escalated_high_medium_scrubbed: number;
  // Item lists use URL-scrubbed keys, matching new_items below.
  escalated_items: Array<{ from: Finding['severity']; to: Finding['severity']; type: string; card_id: string; field?: string }>;
  by_severity: Record<string, { new: number; known: number; resolved: number }>;
  new_items: Array<{ severity: string; type: string; card_id: string; field?: string }>;
}
const hm = (f: Finding) => f.severity === 'high' || f.severity === 'medium';
export function auditStateReport(prev: Finding[] | null, cur: Finding[], baseline: string | null): AuditStateReport {
  const weeklyChanges = classifyFindings(prev || [], cur);
  const scrubbedChanges = classifyFindings(prev || [], cur, scrubbedFindingKey);
  const pks = new Set((prev || []).map(scrubbedFindingKey));
  const ck = new Set(cur.map(scrubbedFindingKey));
  const by_severity: AuditStateReport['by_severity'] = {};
  const bump = (s: string, k: 'new' | 'known' | 'resolved') => { (by_severity[s] ||= { new: 0, known: 0, resolved: 0 })[k]++; };
  const freshScrubbed = scrubbedChanges.new.filter(hm);
  for (const f of cur) { const known = pks.has(scrubbedFindingKey(f)); bump(f.severity, known ? 'known' : 'new'); }
  for (const f of prev || []) if (!ck.has(scrubbedFindingKey(f))) bump(f.severity, 'resolved');
  return {
    baseline, current: cur.length, previous: prev?.length ?? 0,
    new_high_medium: prev ? weeklyChanges.new.filter(hm).length : 0,
    new_high_medium_scrubbed: prev ? freshScrubbed.length : 0,
    known_high_medium: cur.filter(f => hm(f) && pks.has(scrubbedFindingKey(f))).length,
    resolved_high_medium: (prev || []).filter(f => hm(f) && !ck.has(scrubbedFindingKey(f))).length,
    escalated_high_medium: prev ? weeklyChanges.escalated.filter(e => hm(e.current)).length : 0,
    escalated_high_medium_scrubbed: prev ? scrubbedChanges.escalated.filter(e => hm(e.current)).length : 0,
    escalated_items: prev ? scrubbedChanges.escalated.filter(e => hm(e.current)).map(({ current: f, from, to }) => ({ from, to, type: f.type, card_id: f.card_id, field: f.field })) : [],
    by_severity,
    new_items: prev ? freshScrubbed.map(f => ({ severity: f.severity, type: f.type, card_id: f.card_id, field: f.field })) : [],
  };
}
/** Latest db-audit report strictly before `today` (same rule as weekly.ts). */
export const baselineFile = (names: string[], today: string) => [...names].filter(n => /^\d{4}-\d{2}-\d{2}-db-audit\.json$/.test(n)).sort().reverse().find(n => n.slice(0, 10) < today) || null;

export function renderOffer(r: OfferStateReport, limit = 20): string {
  const l = [
    '| offer (vs seeded ops-state) | new | known | total |', '|---|---|---|---|',
    `| holds + expiry reviews | ${r.holds.new} | ${r.holds.known} | ${r.holds.total} |`,
    `| all-fetch-failed cards | ${r.fetch_failures.new} | ${r.fetch_failures.known} | ${r.fetch_failures.now} |`,
    '', `new holds: no_publish_mode ${r.holds.new_no_publish_mode} (would be auto-applied by a publishing run) · other ${r.holds.new_other}`,
    `ledger entries ${r.ledger.before} → ${r.ledger.after} (added ${r.ledger.added}, status changed ${r.ledger.status_changed}) · history +${r.history.appended} ${JSON.stringify(r.history.by_type)}`,
  ];
  for (const h of r.holds.new_items.slice(0, limit)) l.push(`- new ${h.kind}: ${h.card_id} ${h.field ?? ''} (${h.reasons.join(', ')})`);
  for (const c of r.fetch_failures.new_cards.slice(0, limit)) l.push(`- new fetch failure: ${c}`);
  return l.join('\n');
}
export function renderAudit(r: AuditStateReport, limit = 20): string {
  const l = [`baseline: ${r.baseline ?? '(none)'} · findings ${r.previous} → ${r.current}`,
    `high/medium: new ${r.new_high_medium} (weekly.ts key) / ${r.new_high_medium_scrubbed} (URL-scrubbed key) · known ${r.known_high_medium} · resolved ${r.resolved_high_medium}`,
    `high/medium escalated: ${r.escalated_high_medium} (weekly.ts key) / ${r.escalated_high_medium_scrubbed} (URL-scrubbed key)`,
    '', '| severity | new | known | resolved |', '|---|---|---|---|'];
  for (const s of ['high', 'medium', 'low']) { const x = r.by_severity[s]; if (x) l.push(`| ${s} | ${x.new} | ${x.known} | ${x.resolved} |`); }
  for (const f of r.new_items.slice(0, limit)) l.push(`- new [${f.severity}] ${f.type} ${f.card_id}${f.field ? ` ${f.field}` : ''}`);
  for (const f of r.escalated_items.slice(0, limit)) l.push(`- escalated [${f.from} → ${f.to}] ${f.type} ${f.card_id}${f.field ? ` ${f.field}` : ''}`);
  return l.join('\n');
}
