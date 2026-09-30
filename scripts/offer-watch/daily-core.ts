/** Pure helpers for daily.ts: what is *new* in this run, and the short Traditional Chinese summary (or NO_REPLY). */
import { changeFingerprint, type Candidate, type Ledger } from './gate';
import type { HistoryEvent } from './state';
import { fieldName, reasonText, val, TYPE } from './digest-core';

export interface HeldLike { card_id: string; field: string | null; value?: unknown; reasons: string[]; fingerprint?: string }
export interface ApplyLike { applied?: Array<{ card_id: string }>; held?: HeldLike[]; expiry_review?: HeldLike[] }
export interface StepFailure { step: string; detail: string }
export interface NewHold { card_id: string; field: string | null; value?: unknown; reasons: string[]; kind: 'held' | 'expiry_review' }

/** Same keys apply.ts writes to the ledger. */
export const holdKey = (h: HeldLike, kind: 'held' | 'expiry_review') => kind === 'held'
  ? (h.fingerprint ?? changeFingerprint(h.card_id, h.field ?? 'card', h.value ?? null, 'public'))
  : changeFingerprint(h.card_id, `expiry_review:${h.field}`, h.reasons.join(','), 'public');

/** Held / expiry-review items that were not already held with the same reasons before this run started. */
export function newHolds(apply: ApplyLike | null, before: Ledger): NewHold[] {
  if (!apply) return [];
  const out: NewHold[] = [];
  for (const [kind, items] of [['held', apply.held || []], ['expiry_review', apply.expiry_review || []]] as const) {
    for (const h of items) {
      const prev = before.entries?.[holdKey(h, kind)];
      if (prev && prev.status === 'needs_verification' && JSON.stringify(prev.reasons ?? null) === JSON.stringify(h.reasons)) continue;
      out.push({ card_id: h.card_id, field: h.field, value: h.value, reasons: h.reasons, kind });
    }
  }
  return out;
}

/** Non-hold-only cards whose every official fetch failed this run (card effectively unmonitored today). */
export function allFetchesFailed(candidates: Candidate[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of candidates) {
    const confs = c.evidence?.confirmations || [];
    if (c.evidence?.hold_only || !confs.length || confs.some(f => f.ok)) continue;
    out[c.card_id] = [...new Set(confs.map(f => String(f.error ?? 'unknown').split(':')[0]))];
  }
  return out;
}
/** Only cards that were not already failing at the previous run are new. */
export const newFetchFailures = (now: Record<string, string[]>, previous: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(now).filter(([id]) => !(id in previous)));

export interface SummaryInput {
  today: string; events: HistoryEvent[]; stepFailures: StepFailure[]; holds: NewHold[]; fetchFailures: Record<string, string[]>; digest?: string | null; maxChars?: number;
  /** --dry-run only: changes apply would make. */
  planned?: Array<{ card_id: string; changes: Array<{ field: string; old_value: unknown; new_value: unknown }> }>;
}
const FAILURE_TYPES = new Set(Object.keys(TYPE));

/** '' sections are omitted; returns 'NO_REPLY' when there is nothing new (and no digest). */
export function buildDailySummary(input: SummaryInput): string {
  const maxChars = input.maxChars ?? 1800;
  const published = input.events.filter(e => e.type === 'published');
  const failedEvents = input.events.filter(e => FAILURE_TYPES.has(e.type));
  const sections: Array<[string, string[]]> = [
    ['🧪 預計套用（dry-run，未寫入）', (input.planned || []).map(p => `- ${p.card_id}：${p.changes.map(c => `${fieldName(c.field)} ${val(c.old_value)}→${val(c.new_value)}`).join('，')}`)],
    ['✅ 已自動上線', published.map(e => `- ${e.card_id}：${(e.changes || []).map(c => `${fieldName(c.field)} ${val(c.old_value)}→${val(c.new_value)}`).join('，')}${e.commit ? `（${e.commit.slice(0, 7)}）` : ''}`)],
    ['⏳ 新增待確認（未上線）', input.holds.map(h => `- ${h.card_id}${h.field ? `：${fieldName(h.field)}${h.value !== undefined && h.value !== null ? ` → ${val(h.value)}` : ''}` : ''}（${reasonText(h.reasons) || '待確認'}）`)],
    ['⚠️ 失敗／回滾', [
      ...input.stepFailures.map(f => `- ${f.step}：${f.detail.slice(0, 120)}`),
      ...failedEvents.map(e => `- ${e.card_id ?? '全部'}：${TYPE[e.type]}${e.reasons?.length ? `（${String(e.reasons[0]).slice(0, 80)}）` : ''}${e.revert_commits?.length ? ` 已回滾 ${e.revert_commits.map(s => s.slice(0, 7)).join(',')}` : ''}`),
      ...Object.entries(input.fetchFailures).map(([id, errors]) => `- ${id}：所有官方頁面抓取失敗（${errors.join('、').slice(0, 80)}）`),
    ]],
  ];
  const hasNews = sections.some(([, items]) => items.length);
  if (!hasNews && !input.digest) return 'NO_REPLY';
  const lines: string[] = [];
  if (hasNews) {
    lines.push(`OpenCard 優惠監測 ${input.today}`);
    const reserve = input.digest ? Math.min(700, Math.floor(maxChars / 3)) : 0;
    const budget = maxChars - reserve - 30;
    for (const [title, items] of sections) {
      if (!items.length) continue;
      lines.push('', title);
      let shown = 0;
      for (const item of items) { if ([...lines, item].join('\n').length > budget) break; lines.push(item); shown++; }
      if (shown < items.length) lines.push(`- …另有 ${items.length - shown} 項`);
    }
  }
  let text = lines.join('\n');
  if (input.digest) {
    const room = maxChars - text.length - (text ? 2 : 0);
    let digest = input.digest.trim();
    if (digest.length > room) { const cut = digest.slice(0, Math.max(0, room - 2)); digest = `${cut.slice(0, Math.max(0, cut.lastIndexOf('\n')))}\n…`; }
    text = text ? `${text}\n\n${digest}` : digest;
  }
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/** Monday in America/Los_Angeles for a YYYY-MM-DD PT date. */
export const isMonday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === 1;
