import type { Ledger } from './gate';
import type { HistoryEvent } from './state';

const REASONS: Record<string, string> = {
  needs_two_independent_official_fetches: '未取得兩次官方頁面確認', official_fetches_disagree: '官方頁面數值不一致', ambiguous_value_on_official_page: '官方頁面數值不明確',
  primary_source_not_official_domain: '來源非官方網域', official_claim_from_non_allowlisted_domain: '來源非官方網域', bonus_jump_over_3x: '獎勵變動超過 3 倍',
  annual_fee_jump_over_2x: '年費變動超過 2 倍', annual_fee_out_of_range: '年費超出合理範圍', spend_out_of_range: '消費門檻不合理', expiry_in_past: '截止日已過',
  invalid_date: '日期格式錯誤', official_page_fetch_failed: '官方頁面抓取失敗', expired_not_in_watchlist_no_official_fetch: '優惠已過期，尚未列入官方頁面監測',
  expired_offer_still_shown_on_official_page: '已過期但官方頁面仍顯示', expired_no_confirmed_replacement_offer: '已過期，尚無確認的新優惠', card_file_has_uncommitted_changes: '卡片檔案有未提交變更',
  schema_validation_failed: '資料格式驗證失敗', new_product_requires_human_review: '新卡片需人工審核', stale_or_invalid_checked_at: '證據過期', not_marked_official: '非官方來源',
  non_public_audience: '非公開優惠', source_conflicts: '來源互相矛盾', unknown_fields: '含未追蹤欄位',
};
const TYPE: Record<string, string> = { checks_failed: '驗證/建置失敗', push_failed: '推送失敗', deploy_failed: '部署失敗', live_check_failed: '線上檢查失敗', rolled_back: '已回滾', schema_failed: '格式驗證失敗' };
const fieldName = (f: string | null | undefined) => (f || '').replace('welcome_offer.', '').replace('expiry', '截止日').replace('bonus_points', '點數').replace('spending_requirement', '消費門檻')
  .replace('time_period_months', '期限(月)').replace('annual_fee', '年費').replace('is_elevated', '加碼').replace('offer_status', '狀態').replace('cash_bonus', '現金回饋');
const val = (v: unknown) => (v === null || v === undefined ? '無' : typeof v === 'number' ? v.toLocaleString('en-US') : typeof v === 'boolean' ? (v ? '是' : '否') : String(v));
const reasonText = (rs?: string[]) => [...new Set((rs || []).map(r => REASONS[r.split(':')[0]] || r))].join('、');

/** End of `day` in America/Los_Angeles (history timestamps are UTC). */
export function laEndOfDay(day: string): number {
  const probe = new Date(`${day}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset' }).formatToParts(probe).find(p => p.type === 'timeZoneName')?.value || 'GMT-08:00';
  const offset = name === 'GMT' ? 'Z' : name.replace('GMT', '');
  return Date.parse(`${day}T23:59:59.999${offset}`);
}

/** Traditional Chinese weekly digest (window = 7 PT days ending `today`), hard-capped at maxChars. */
export function buildDigest(events: HistoryEvent[], ledger: Ledger, today: string, maxChars = 1800): string {
  const end = laEndOfDay(today), start = end - 7 * 86400000;
  const recent = events.filter(e => { const t = Date.parse(e.ts); return t > start && t <= end; });
  const published = recent.filter(e => e.type === 'published');
  const failures = recent.filter(e => TYPE[e.type]);
  const heldMap = new Map<string, { card: string; field: string | null; value: unknown; reasons?: string[] }>();
  for (const [key, entry] of Object.entries(ledger.entries || {})) {
    if (entry.status !== 'needs_verification' || Date.parse(entry.last_seen) <= start) continue;
    heldMap.set(key, { card: entry.card_id, field: entry.field, value: entry.value, reasons: entry.reasons });
  }
  const held = [...heldMap.values()];
  const startDate = new Date(start + 1).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const header = [`# OpenCard 優惠監測週報（${startDate} ～ ${today}）`, '', `自動上線 ${published.length} 項｜待官方確認 ${held.length} 項｜失敗/回滾 ${failures.length} 項`, ''];
  const sections: Array<[string, string[]]> = [
    ['## ✅ 已自動上線', published.map(e => `- ${e.card_id}：${(e.changes || []).map(c => `${fieldName(c.field)} ${val(c.old_value)}→${val(c.new_value)}`).join('，')}${e.commit ? `（${e.commit.slice(0, 7)}）` : ''}`)],
    ['## ⏳ 待官方確認（未上線）', held.map(h => `- ${h.card}${h.field ? `：${fieldName(h.field)}${h.value !== null && h.value !== undefined ? ` → ${val(h.value)}` : ''}` : ''}（${reasonText(h.reasons) || '待確認'}）`)],
    ['## ⚠️ 失敗／回滾', failures.map(e => `- ${e.card_id ?? '全部'}：${TYPE[e.type]}${e.reasons?.length ? `（${e.reasons[0].slice(0, 80)}）` : ''}${e.revert_commits?.length ? ` 回滾 ${e.revert_commits.map(s => s.slice(0, 7)).join(',')}` : ''}`)],
  ];
  const lines = [...header];
  const footer = ['', '資料僅在兩次官方頁面確認且驗證、建置、線上檢查皆通過後才會自動上線。'];
  const budget = maxChars - footer.join('\n').length - 20;
  for (const [title, items] of sections) {
    lines.push(title);
    if (!items.length) { lines.push('- 無'); lines.push(''); continue; }
    let shown = 0;
    for (const item of items) {
      if ([...lines, item].join('\n').length > budget) break;
      lines.push(item); shown++;
    }
    if (shown < items.length) lines.push(`- …另有 ${items.length - shown} 項`);
    lines.push('');
  }
  let text = [...lines, ...footer].join('\n');
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 2)}…`;
  return text;
}
