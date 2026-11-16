/** Pure weekly notification rendering; importing this module never runs an audit. */
import { classifyFindings, type Finding } from './finding-key';

const MAX_CHARS = 1800;
const SEVERITY_ZH = { low: '低', medium: '中', high: '高' };
const TYPE_ZH: Record<string, string> = {
  broken_source_url: '官方來源網址失效 (404)', source_redirects_elsewhere: '來源網址被轉址到其他頁面', missing_sources: '缺少來源',
  no_official_source: '沒有官方來源', duplicate_credit: '重複的年度禮遇', credit_frequency_mismatch: '禮遇頻率與說明不符',
  discontinued_signal_without_status: '疑似停發但未標記', discontinued_with_offer: '停發卡仍顯示開卡禮', closed_with_offer: '停發卡仍顯示開卡禮',
  description_mismatch: '開卡禮說明與數值不符', impossible_value: '不合理數值', possible_issuer_change: '可能已更換發卡行',
  network_mismatch: '卡組織不符', wrong_issuer_reference: '文字提到錯誤的發卡行', value_inconsistent: '估值與點數不一致',
  expired_still_elevated: '優惠已過期仍標記加碼', duplicate_card_entry: '重複的卡片條目', schema_type: '欄位格式錯誤',
  currency_mismatch: '點數/哩程/現金單位不符', stale_benefit: '已結束的福利', fee_text_mismatch: '年費文字與欄位不符',
  stale_last_verified: '資料久未驗證', past_next_review: '已過預定審查日期',
};

export function renderWeeklySummary(previous: Finding[] | null, current: Finding[], today: string, baselineDate: string, dir: string): string {
  if (!previous) return 'NO_REPLY';
  const changes = classifyFindings(previous, current);
  const fresh = changes.new.filter(f => f.severity === 'high' || f.severity === 'medium');
  const escalated = changes.escalated.filter(e => e.to === 'high' || e.to === 'medium');
  if (fresh.length === 0 && escalated.length === 0) return 'NO_REPLY';

  const high = fresh.filter(f => f.severity === 'high').length;
  const counts = [];
  if (fresh.length) counts.push(`新增 ${fresh.length} 項問題 (高 ${high}、中 ${fresh.length - high})`);
  const escalatedHigh = escalated.filter(e => e.to === 'high').length;
  if (escalated.length) counts.push(`升級 ${escalated.length} 項問題 (→高 ${escalatedHigh}、→中 ${escalated.length - escalatedHigh})`);
  const lines = [`📋 OpenCard 每週資料庫稽核 (${today})：${counts.join('、')}，對比 ${baselineDate}。`];
  const byType = new Map<string, Finding[]>();
  for (const f of fresh) (byType.get(f.type) || byType.set(f.type, []).get(f.type)!).push(f);
  const sorted = [...byType.entries()].sort((a, b) => Number(b[1][0].severity === 'high') - Number(a[1][0].severity === 'high') || b[1].length - a[1].length);
  for (const [t, fs_] of sorted) {
    lines.push(`\n【${fs_[0].severity === 'high' ? '高' : '中'}】${TYPE_ZH[t] || t}（${fs_.length}）`);
    for (const f of fs_.slice(0, 5)) lines.push(`• ${f.popular ? '⭐' : ''}${f.card_id}：${f.detail.slice(0, 110)}`);
    if (fs_.length > 5) lines.push(`• …另 ${fs_.length - 5} 項`);
  }
  if (escalated.length) {
    lines.push('\n【升級】');
    const sortedEscalations = [...escalated].sort((a, b) => Number(b.to === 'high') - Number(a.to === 'high'));
    for (const { current: f, from, to } of sortedEscalations.slice(0, 5)) {
      lines.push(`• ${f.popular ? '⭐' : ''}${f.card_id}（${SEVERITY_ZH[from]}→${SEVERITY_ZH[to]}）：${TYPE_ZH[f.type] || f.type}：${f.detail.slice(0, 110)}`);
    }
    if (escalated.length > 5) lines.push(`• …另 ${escalated.length - 5} 項`);
  }
  lines.push(`\n完整報告：${dir}/${today}-db-audit.md`);
  let msg = lines.join('\n');
  if (msg.length > MAX_CHARS) {
    const tail = `\n…（已截斷）完整報告：${dir}/${today}-db-audit.md`;
    msg = msg.slice(0, MAX_CHARS - tail.length).replace(/\n[^\n]*$/, '') + tail;
  }
  return msg;
}
